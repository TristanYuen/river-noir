import { createDeck, shuffleDeck } from "./cards.js";
import { compareHands, evaluateBestHand } from "./evaluator.js";
import { buildPots } from "./pots.js";
import type {
  Card,
  GameConfig,
  GameEvent,
  GameState,
  HandResult,
  LegalAction,
  PlayerAction,
  PotAward,
  RandomSource,
  Street,
  TablePlayer,
} from "./types.js";

export interface NewPlayer {
  readonly id: string;
  readonly name: string;
  readonly seat: number;
  readonly stack?: number;
}

export interface NewGameOptions {
  readonly tableId: string;
  readonly config: GameConfig;
  readonly players: readonly NewPlayer[];
}

function assertConfig(config: GameConfig): void {
  if (!Number.isInteger(config.maxSeats) || config.maxSeats < 2 || config.maxSeats > 10) {
    throw new Error("maxSeats must be an integer from 2 to 10.");
  }
  if (!Number.isInteger(config.smallBlind) || config.smallBlind <= 0) throw new Error("smallBlind must be positive.");
  if (!Number.isInteger(config.bigBlind) || config.bigBlind <= config.smallBlind) {
    throw new Error("bigBlind must be greater than smallBlind.");
  }
  if (!Number.isInteger(config.initialStack) || config.initialStack < config.bigBlind) {
    throw new Error("initialStack must cover at least one big blind.");
  }
}

export function createGame(options: NewGameOptions): GameState {
  assertConfig(options.config);
  if (options.players.length < 2 || options.players.length > options.config.maxSeats) {
    throw new Error("A table needs between 2 players and maxSeats players.");
  }
  const ids = options.players.map((player) => player.id);
  const seats = options.players.map((player) => player.seat);
  if (new Set(ids).size !== ids.length) throw new Error("Player ids must be unique.");
  if (new Set(seats).size !== seats.length) throw new Error("Seat numbers must be unique.");
  if (seats.some((seat) => !Number.isInteger(seat) || seat < 0 || seat >= options.config.maxSeats)) {
    throw new Error("A player has an invalid seat number.");
  }

  const players: TablePlayer[] = options.players
    .map((player) => {
      const stack = player.stack ?? options.config.initialStack;
      if (!Number.isInteger(stack) || stack < 0) throw new Error("Player stacks must be non-negative integers.");
      return {
        id: player.id,
        name: player.name,
        seat: player.seat,
        stack,
        status: stack > 0 ? "ready" : "busted",
        holeCards: [],
        committedStreet: 0,
        committedHand: 0,
      } satisfies TablePlayer;
    })
    .sort((left, right) => left.seat - right.seat);

  return {
    tableId: options.tableId,
    handNumber: 0,
    handId: null,
    version: 0,
    config: options.config,
    phase: "waiting",
    street: "preflop",
    buttonSeat: null,
    smallBlindSeat: null,
    bigBlindSeat: null,
    actingSeat: null,
    currentBet: 0,
    minRaise: options.config.bigBlind,
    players,
    deck: [],
    communityCards: [],
    pendingPlayerIds: [],
    raiseLockedPlayerIds: [],
    actionLog: [],
    result: null,
  };
}

function playerById(state: GameState, playerId: string): TablePlayer {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  return player;
}

function replacePlayer(players: readonly TablePlayer[], next: TablePlayer): TablePlayer[] {
  return players.map((player) => (player.id === next.id ? next : player));
}

function orderedSeats(players: readonly TablePlayer[]): number[] {
  return players.map((player) => player.seat).sort((a, b) => a - b);
}

function nextSeat(players: readonly TablePlayer[], afterSeat: number, predicate: (player: TablePlayer) => boolean): number {
  const seats = orderedSeats(players);
  const orderedAfter = [...seats.filter((seat) => seat > afterSeat), ...seats.filter((seat) => seat <= afterSeat)];
  for (const seat of orderedAfter) {
    const player = players.find((candidate) => candidate.seat === seat);
    if (seat !== undefined && player && predicate(player)) return seat;
  }
  throw new Error("No eligible next seat was found.");
}

function firstSeat(players: readonly TablePlayer[], predicate: (player: TablePlayer) => boolean): number {
  const player = [...players].sort((a, b) => a.seat - b.seat).find(predicate);
  if (!player) throw new Error("No eligible seat was found.");
  return player.seat;
}

function commitChips(player: TablePlayer, requestedAmount: number): { player: TablePlayer; amount: number } {
  const amount = Math.max(0, Math.min(requestedAmount, player.stack));
  const stack = player.stack - amount;
  return {
    amount,
    player: {
      ...player,
      stack,
      status: stack === 0 ? "allIn" : player.status,
      committedStreet: player.committedStreet + amount,
      committedHand: player.committedHand + amount,
    },
  };
}

function postBlind(players: readonly TablePlayer[], seat: number, amount: number): { players: TablePlayer[]; posted: number } {
  const player = players.find((candidate) => candidate.seat === seat);
  if (!player || player.stack <= 0 || player.status === "busted" || player.status === "sittingOut") {
    return { players: [...players], posted: 0 };
  }
  const committed = commitChips(player, amount);
  return { players: replacePlayer(players, committed.player), posted: committed.amount };
}

function dealHoleCards(players: readonly TablePlayer[], deck: readonly Card[], buttonSeat: number): {
  players: TablePlayer[];
  deck: Card[];
} {
  const active = players.filter((player) => player.status === "active" || player.status === "allIn");
  const firstDealSeat = active.length === 2
    ? buttonSeat
    : nextSeat(active, buttonSeat, () => true);
  const dealOrder: TablePlayer[] = [];
  let seat = firstDealSeat;
  for (let index = 0; index < active.length; index += 1) {
    const player = active.find((candidate) => candidate.seat === seat);
    if (!player) throw new Error("Invalid deal order.");
    dealOrder.push(player);
    seat = nextSeat(active, seat, () => true);
  }

  const remaining = [...deck];
  const cardsByPlayer = new Map(active.map((player) => [player.id, [] as Card[]]));
  for (let round = 0; round < 2; round += 1) {
    for (const player of dealOrder) {
      const card = remaining.shift();
      if (!card) throw new Error("Deck ran out while dealing hole cards.");
      cardsByPlayer.get(player.id)?.push(card);
    }
  }

  return {
    deck: remaining,
    players: players.map((player) => ({ ...player, holeCards: cardsByPlayer.get(player.id) ?? [] })),
  };
}

export function startHand(state: GameState, random: RandomSource, handId = `${state.tableId}-${state.handNumber + 1}`): GameState {
  if (state.phase !== "waiting" && state.phase !== "complete") throw new Error("The current hand is still running.");
  const eligibleIds = state.players.filter((player) => player.stack > 0 && player.status !== "sittingOut").map((player) => player.id);
  if (eligibleIds.length < 2) throw new Error("At least two funded players are required.");

  let players: TablePlayer[] = state.players.map((player) => ({
    ...player,
    status: eligibleIds.includes(player.id) ? "active" : player.status === "sittingOut" ? "sittingOut" : "busted",
    holeCards: [],
    committedStreet: 0,
    committedHand: 0,
  }));
  const activePlayers = players.filter((player) => eligibleIds.includes(player.id));
  const headsUp = activePlayers.length === 2;
  let buttonSeat: number;
  let smallBlindSeat: number;
  let bigBlindSeat: number;
  if (state.buttonSeat === null || state.bigBlindSeat === null) {
    buttonSeat = firstSeat(activePlayers, () => true);
    smallBlindSeat = headsUp ? buttonSeat : nextSeat(activePlayers, buttonSeat, () => true);
    bigBlindSeat = nextSeat(activePlayers, smallBlindSeat, () => true);
  } else if (headsUp) {
    bigBlindSeat = nextSeat(activePlayers, state.bigBlindSeat, () => true);
    buttonSeat = nextSeat(activePlayers, bigBlindSeat, () => true);
    smallBlindSeat = buttonSeat;
  } else {
    buttonSeat = state.smallBlindSeat ?? (state.buttonSeat + 1) % state.config.maxSeats;
    smallBlindSeat = state.bigBlindSeat;
    bigBlindSeat = nextSeat(activePlayers, state.bigBlindSeat, () => true);
  }

  const smallBlind = postBlind(players, smallBlindSeat, state.config.smallBlind);
  players = smallBlind.players;
  const bigBlind = postBlind(players, bigBlindSeat, state.config.bigBlind);
  players = bigBlind.players;

  const shuffled = shuffleDeck(createDeck(), random);
  const dealt = dealHoleCards(players, shuffled, buttonSeat);
  players = dealt.players;

  const pendingPlayerIds = players
    .filter((player) => eligibleIds.includes(player.id) && player.status === "active")
    .map((player) => player.id);
  const firstToActSeat = headsUp && pendingPlayerIds.includes(players.find((player) => player.seat === buttonSeat)?.id ?? "")
    ? buttonSeat
    : nextSeat(players, headsUp ? buttonSeat : bigBlindSeat, (player) => pendingPlayerIds.includes(player.id));
  const currentBet = Math.max(...players.map((player) => player.committedStreet));
  const events: GameEvent[] = [{ type: "handStarted", handId, handNumber: state.handNumber + 1 }];
  const smallBlindPlayer = players.find((player) => player.seat === smallBlindSeat);
  if (smallBlindPlayer && smallBlind.posted > 0) {
    events.push({ type: "blindPosted", playerId: smallBlindPlayer.id, blind: "small", amount: smallBlind.posted });
  }
  const bigBlindPlayer = players.find((player) => player.seat === bigBlindSeat);
  if (bigBlindPlayer && bigBlind.posted > 0) {
    events.push({ type: "blindPosted", playerId: bigBlindPlayer.id, blind: "big", amount: bigBlind.posted });
  }
  events.push({ type: "cardsDealt" });

  return normalizeProgress({
    ...state,
    handNumber: state.handNumber + 1,
    handId,
    version: state.version + 1,
    phase: "betting",
    street: "preflop",
    buttonSeat,
    smallBlindSeat,
    bigBlindSeat,
    actingSeat: firstToActSeat,
    currentBet,
    minRaise: state.config.bigBlind,
    players,
    deck: dealt.deck,
    communityCards: [],
    pendingPlayerIds,
    raiseLockedPlayerIds: [],
    actionLog: events,
    result: null,
  });
}

function amountToCall(state: GameState, player: TablePlayer): number {
  return Math.max(0, state.currentBet - player.committedStreet);
}

export function getLegalActions(state: GameState, playerId: string): LegalAction[] {
  if (state.phase !== "betting") return [];
  const player = playerById(state, playerId);
  if (player.seat !== state.actingSeat || player.status !== "active") return [];

  const callAmount = amountToCall(state, player);
  const maximum = player.committedStreet + player.stack;
  const actions: LegalAction[] = [{ type: "fold" }];
  if (callAmount === 0) actions.push({ type: "check" });
  if (callAmount > 0) actions.push({ type: "call", amountToCall: Math.min(callAmount, player.stack) });

  const canIncreaseBet = maximum > state.currentBet && !state.raiseLockedPlayerIds.includes(player.id);
  if (canIncreaseBet) {
    const minimum = state.currentBet === 0 ? state.minRaise : state.currentBet + state.minRaise;
    if (maximum >= minimum) {
      actions.push({
        type: state.currentBet === 0 ? "bet" : "raise",
        minAmount: minimum,
        maxAmount: maximum,
      });
    }
  }
  if (maximum <= state.currentBet || !state.raiseLockedPlayerIds.includes(player.id)) {
    actions.push({ type: "allIn", maxAmount: maximum });
  }
  return actions;
}

function validateAction(state: GameState, action: PlayerAction): TablePlayer {
  if (state.phase !== "betting") throw new Error("No betting action is currently available.");
  const player = playerById(state, action.playerId);
  if (player.seat !== state.actingSeat) throw new Error("It is not this player's turn.");
  if (player.status !== "active") throw new Error("This player cannot act.");
  const legal = getLegalActions(state, player.id);
  const legalType = legal.find((candidate) => candidate.type === action.type);
  if (!legalType) throw new Error(`Illegal action: ${action.type}`);
  if (action.type === "bet" || action.type === "raise") {
    if (action.amount === undefined || !Number.isInteger(action.amount)) throw new Error("A whole-chip target amount is required.");
    if (action.amount < (legalType.minAmount ?? 0) || action.amount > (legalType.maxAmount ?? 0)) {
      throw new Error("The target amount is outside the legal range.");
    }
  }
  return player;
}

export function applyAction(state: GameState, action: PlayerAction): GameState {
  const player = validateAction(state, action);
  const oldCurrentBet = state.currentBet;
  const callAmount = amountToCall(state, player);
  let players = [...state.players];
  let updatedPlayer = player;
  let contributed = 0;
  let currentBet = state.currentBet;
  let minRaise = state.minRaise;
  let pending = new Set(state.pendingPlayerIds);
  const raiseLocked = new Set(state.raiseLockedPlayerIds);

  if (action.type === "fold") {
    updatedPlayer = { ...player, status: "folded" };
    pending.delete(player.id);
  } else if (action.type === "check") {
    pending.delete(player.id);
  } else {
    let targetStreetAmount: number;
    if (action.type === "call") targetStreetAmount = player.committedStreet + Math.min(callAmount, player.stack);
    else if (action.type === "allIn") targetStreetAmount = player.committedStreet + player.stack;
    else targetStreetAmount = action.amount ?? player.committedStreet;

    const committed = commitChips(player, targetStreetAmount - player.committedStreet);
    updatedPlayer = committed.player;
    contributed = committed.amount;
    const raisedTo = updatedPlayer.committedStreet;
    if (raisedTo > oldCurrentBet) {
      const increment = raisedTo - oldCurrentBet;
      const fullRaise = increment >= state.minRaise;
      const pendingBefore = new Set(pending);
      currentBet = raisedTo;
      pending = new Set(
        players
          .filter((candidate) => candidate.id !== player.id && candidate.status === "active" && candidate.stack > 0)
          .map((candidate) => candidate.id),
      );
      if (fullRaise) {
        minRaise = increment;
        raiseLocked.clear();
      } else {
        for (const candidate of players) {
          if (candidate.id === player.id || !pendingBefore.has(candidate.id)) raiseLocked.add(candidate.id);
        }
      }
    } else {
      pending.delete(player.id);
    }
  }

  players = replacePlayer(players, updatedPlayer);
  if (currentBet > oldCurrentBet) {
    for (const lockedPlayerId of [...raiseLocked]) {
      const lockedPlayer = players.find((candidate) => candidate.id === lockedPlayerId);
      if (lockedPlayer && currentBet - lockedPlayer.committedStreet >= minRaise) {
        raiseLocked.delete(lockedPlayerId);
      }
    }
  }
  pending = new Set([...pending].filter((id) => playerById({ ...state, players }, id).status === "active"));
  const amount = action.type === "fold" || action.type === "check" ? 0 : contributed;
  let nextState: GameState = {
    ...state,
    version: state.version + 1,
    players,
    currentBet,
    minRaise,
    pendingPlayerIds: [...pending],
    raiseLockedPlayerIds: [...raiseLocked],
    actionLog: [...state.actionLog, { type: "playerActed", playerId: player.id, action: action.type, amount }],
  };

  const contenders = nextState.players.filter((candidate) => candidate.status === "active" || candidate.status === "allIn");
  if (contenders.length === 1) return settleByFold(nextState, contenders[0]?.id ?? "");

  if (pending.size > 0) {
    const actingSeat = nextSeat(nextState.players, player.seat, (candidate) => pending.has(candidate.id));
    return { ...nextState, actingSeat };
  }
  nextState = refundUncalledContribution(nextState);
  return normalizeProgress(nextState);
}

function refundUncalledContribution(state: GameState): GameState {
  const ordered = [...state.players].sort((left, right) => right.committedStreet - left.committedStreet);
  const highest = ordered[0];
  const second = ordered[1];
  if (!highest || !second || highest.committedStreet <= second.committedStreet) return state;
  const refund = highest.committedStreet - second.committedStreet;
  const nextHighest: TablePlayer = {
    ...highest,
    stack: highest.stack + refund,
    status: highest.status === "allIn" && refund > 0 ? "active" : highest.status,
    committedStreet: highest.committedStreet - refund,
    committedHand: highest.committedHand - refund,
  };
  return {
    ...state,
    players: replacePlayer(state.players, nextHighest),
    currentBet: Math.min(state.currentBet, second.committedStreet),
  };
}

function dealCommunity(state: GameState, street: Exclude<Street, "preflop" | "showdown">): GameState {
  const deck = [...state.deck];
  const burn = deck.shift();
  if (!burn) throw new Error("Deck ran out before the burn card.");
  const count = street === "flop" ? 3 : 1;
  const cards = deck.splice(0, count);
  if (cards.length !== count) throw new Error("Deck ran out while dealing community cards.");
  const players = state.players.map((player) => ({ ...player, committedStreet: 0 }));
  return {
    ...state,
    street,
    players,
    deck,
    communityCards: [...state.communityCards, ...cards],
    currentBet: 0,
    minRaise: state.config.bigBlind,
    pendingPlayerIds: players.filter((player) => player.status === "active" && player.stack > 0).map((player) => player.id),
    raiseLockedPlayerIds: [],
    actionLog: [...state.actionLog, { type: "streetChanged", street, cards }],
  };
}

function normalizeProgress(state: GameState): GameState {
  const contenders = state.players.filter((player) => player.status === "active" || player.status === "allIn");
  if (contenders.length === 1) return settleByFold(state, contenders[0]?.id ?? "");

  let next = state;
  const immediatelyActionable = next.players.filter((player) => player.status === "active" && player.stack > 0);
  if (
    immediatelyActionable.length === 1
    && immediatelyActionable[0]
    && immediatelyActionable[0].committedStreet >= next.currentBet
  ) {
    next = refundUncalledContribution({ ...next, pendingPlayerIds: [], actingSeat: null });
  }
  while (next.pendingPlayerIds.length === 0) {
    if (next.street === "river") return settleShowdown(next);
    const street = next.street === "preflop"
      ? "flop"
      : next.street === "flop"
        ? "turn"
        : next.street === "turn"
          ? "river"
          : null;
    if (!street) return settleShowdown(next);
    next = dealCommunity(next, street);
    const actionable = next.players.filter((player) => player.status === "active" && player.stack > 0);
    if (actionable.length >= 2) {
      const buttonSeat = next.buttonSeat;
      if (buttonSeat === null) throw new Error("A running hand has no button.");
      const actingSeat = nextSeat(next.players, buttonSeat, (player) => next.pendingPlayerIds.includes(player.id));
      return { ...next, actingSeat };
    }
    next = { ...next, pendingPlayerIds: [], actingSeat: null };
  }
  return next;
}

function seatOrderAfterButton(state: GameState, playerIds: readonly string[]): string[] {
  const buttonSeat = state.buttonSeat;
  if (buttonSeat === null) return [...playerIds];
  const maxSeats = state.config.maxSeats;
  return [...playerIds].sort((leftId, rightId) => {
    const left = playerById(state, leftId);
    const right = playerById(state, rightId);
    const leftDistance = (left.seat - buttonSeat + maxSeats) % maxSeats || maxSeats;
    const rightDistance = (right.seat - buttonSeat + maxSeats) % maxSeats || maxSeats;
    return leftDistance - rightDistance;
  });
}

function applyAwards(state: GameState, awards: readonly PotAward[]): TablePlayer[] {
  const totals = new Map<string, number>();
  for (const award of awards) totals.set(award.playerId, (totals.get(award.playerId) ?? 0) + award.amount);
  return state.players.map((player) => {
    const stack = player.stack + (totals.get(player.id) ?? 0);
    return {
      ...player,
      stack,
      status: stack > 0 ? player.status : "busted",
      committedStreet: 0,
      committedHand: 0,
    };
  });
}

function completeHand(state: GameState, result: HandResult): GameState {
  const players = applyAwards(state, result.awards);
  return {
    ...state,
    version: state.version + 1,
    phase: "complete",
    street: "showdown",
    actingSeat: null,
    currentBet: 0,
    players,
    pendingPlayerIds: [],
    raiseLockedPlayerIds: [],
    result,
    actionLog: [...state.actionLog, { type: "handCompleted", result }],
  };
}

function settleByFold(state: GameState, winnerId: string): GameState {
  const settledState = refundUncalledContribution(state);
  const pots = buildPots(settledState.players);
  const awards = pots.map((pot, potIndex) => ({ potIndex, playerId: winnerId, amount: pot.amount }));
  return completeHand(settledState, { reason: "fold", pots, awards });
}

function settleShowdown(state: GameState): GameState {
  if (state.communityCards.length !== 5) throw new Error("Showdown requires five community cards.");
  const pots = buildPots(state.players);
  const awards: PotAward[] = [];

  pots.forEach((pot, potIndex) => {
    const eligible = pot.eligiblePlayerIds.map((id) => playerById(state, id));
    if (eligible.length === 0) throw new Error("A pot has no eligible player.");
    const hands = eligible.map((player) => ({
      player,
      hand: evaluateBestHand([...player.holeCards, ...state.communityCards]),
    }));
    const best = hands.reduce((current, candidate) => (compareHands(candidate.hand, current.hand) > 0 ? candidate : current));
    const winners = hands.filter((candidate) => compareHands(candidate.hand, best.hand) === 0);
    const orderedWinners = seatOrderAfterButton(state, winners.map((winner) => winner.player.id));
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount % winners.length;
    for (const playerId of orderedWinners) {
      const winner = winners.find((candidate) => candidate.player.id === playerId);
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      awards.push({
        potIndex,
        playerId,
        amount: share + extra,
        handDescription: winner?.hand.description ?? best.hand.description,
      });
    }
  });

  return completeHand(state, { reason: "showdown", pots, awards });
}

export function totalChips(state: GameState): number {
  return state.players.reduce((total, player) => total + player.stack + player.committedHand, 0);
}

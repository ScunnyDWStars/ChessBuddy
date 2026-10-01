export type Color = 'w' | 'b';

/**
 * Engine score from White's point of view.
 * `cp` is always set (mates are mapped to ±100000 minus the distance) so that
 * scores can be compared numerically. `mate` is set when a forced mate exists:
 * positive = White mates, negative = Black mates, 0 = the position on the
 * board is already checkmate (sign of `cp` tells who won).
 */
export interface Score {
  cp: number;
  mate?: number;
}

export interface EngineLine {
  /** Score from White's point of view. */
  score: Score;
  /** Principal variation in UCI notation. */
  pv: string[];
  depth: number;
}

export interface PositionEval {
  fen: string;
  /** Best line first. Empty for terminal positions (mate / stalemate / draw). */
  lines: EngineLine[];
  /** Score from White's point of view (lines[0].score or the terminal result). */
  score: Score;
}

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder'
  | 'forced';

export interface GameHeaders {
  white: string;
  black: string;
  whiteElo?: string;
  blackElo?: string;
  result: string;
  date?: string;
  event?: string;
  site?: string;
  timeControl?: string;
  termination?: string;
  link?: string;
}

export interface PlyInfo {
  /** 1-based half-move index. */
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  uci: string;
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  fenBefore: string;
  fenAfter: string;
  /** Seconds left on the mover's clock after the move, if the PGN has %clk. */
  clock?: number;
}

export interface ParsedGame {
  headers: GameHeaders;
  startFen: string;
  moves: PlyInfo[];
  pgn: string;
}

export type Phase = 'opening' | 'middlegame' | 'endgame';

export type Motif =
  | 'checkmate'
  | 'check'
  | 'capture'
  | 'castle'
  | 'promotion'
  | 'develops'
  | 'center'
  | 'sacrifice'
  | 'hangs-piece'
  | 'allows-mate'
  | 'missed-mate'
  | 'missed-material'
  | 'loses-material'
  | 'recapture'
  | 'only-move'
  | 'punishes';

export interface MoveFeedback {
  headline: string;
  text: string;
  motifs: Motif[];
}

export interface AnalyzedMove extends PlyInfo {
  phase: Phase;
  classification: Classification;
  /** Score before the move (best play), White POV. */
  evalBefore: Score;
  /** Score after the move that was played, White POV. */
  evalAfter: Score;
  /** Win probability (0..1) for the mover before / after the move. */
  winBefore: number;
  winAfter: number;
  /** Expected points lost by the move (0..1). */
  loss: number;
  /** Per-move accuracy, 0..100. */
  accuracy: number;
  bestMove?: { uci: string; san: string };
  /** Engine best line (SAN) from the position before the move. */
  bestLine: string[];
  /** Engine's expected continuation (SAN) after the move that was played. */
  replyLine: string[];
  opening?: { eco: string; name: string };
  /** Material (pawn units) the mover leaves en prise with this move. */
  hangs?: { square: string; piece: string; value: number };
  feedback: MoveFeedback;
}

export type ClassCounts = Record<Classification, number>;

export interface SideSummary {
  accuracy: number;
  estimatedRating: number;
  counts: ClassCounts;
  phases: Record<Phase, number | null>;
}

export interface Insight {
  id: string;
  severity: 'high' | 'medium' | 'low' | 'positive';
  title: string;
  detail: string;
  practice: string;
  /** Plies that illustrate the insight. */
  plies: number[];
}

export interface GameReview {
  game: ParsedGame;
  depth: number;
  initialEval: Score;
  moves: AnalyzedMove[];
  opening?: { eco: string; name: string };
  summary: Record<Color, SideSummary>;
  insights: Record<Color, Insight[]>;
}

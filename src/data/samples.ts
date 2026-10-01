export interface SampleGame {
  id: string;
  title: string;
  subtitle: string;
  pgn: string;
}

export const SAMPLE_GAMES: SampleGame[] = [
  {
    id: 'club-blitz',
    title: 'Club blitz game',
    subtitle: 'Italian Game · 5+0 · tactics and time trouble',
    pgn: `[Event "Casual Blitz"]
[Site "ChessBuddy"]
[Date "2026.09.14"]
[White "You"]
[Black "Opponent"]
[Result "0-1"]
[WhiteElo "1150"]
[BlackElo "1185"]
[TimeControl "300"]
[Termination "Opponent won by resignation"]

1. e4 {[%clk 0:04:58]} e5 {[%clk 0:04:57]} 2. Nf3 {[%clk 0:04:57]} Nc6 {[%clk 0:04:55]} 3. Bc4 {[%clk 0:04:53]} Bc5 {[%clk 0:04:52]} 4. Nc3 {[%clk 0:04:50]} Nf6 {[%clk 0:04:47]} 5. d3 {[%clk 0:04:44]} h6 {[%clk 0:04:43]} 6. Be3 {[%clk 0:04:36]} Bb6 {[%clk 0:04:36]} 7. Qd2 {[%clk 0:04:31]} d6 {[%clk 0:04:27]} 8. h3 {[%clk 0:04:25]} Be6 {[%clk 0:04:15]} 9. Bxe6 {[%clk 0:04:15]} fxe6 {[%clk 0:04:07]} 10. Bxh6 {[%clk 0:04:01]} gxh6 {[%clk 0:03:58]} 11. Qxh6 {[%clk 0:03:41]} Rh7 {[%clk 0:03:43]} 12. Qg6+ {[%clk 0:03:30]} Ke7 {[%clk 0:03:25]} 13. Ng5 {[%clk 0:03:05]} Rg7 {[%clk 0:03:11]} 14. Qh6 {[%clk 0:02:35]} Qg8 {[%clk 0:02:49]} 15. O-O-O {[%clk 0:02:20]} Nd4 {[%clk 0:02:19]} 16. f4 {[%clk 0:01:52]} exf4 {[%clk 0:02:00]} 17. Nb5 {[%clk 0:01:28]} Nxb5 {[%clk 0:01:40]} 18. Rdf1 {[%clk 0:00:58]} Rxg5 {[%clk 0:01:24]} 19. Qxg5 {[%clk 0:00:36]} Qxg5 {[%clk 0:01:12]} 20. h4 {[%clk 0:00:16]} Qxg2 {[%clk 0:01:03]} 21. Rxf4 {[%clk 0:00:02]} Qxh1+ {[%clk 0:00:55]} 0-1`,
  },
  {
    id: 'opera',
    title: 'The Opera Game',
    subtitle: 'Morphy vs. Duke Karl / Count Isouard · Paris 1858',
    pgn: `[Event "Paris"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`,
  },
  {
    id: 'immortal',
    title: 'The Immortal Game',
    subtitle: 'Anderssen vs. Kieseritzky · London 1851',
    pgn: `[Event "London"]
[Site "London ENG"]
[Date "1851.06.21"]
[White "Adolf Anderssen"]
[Black "Lionel Kieseritzky"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7# 1-0`,
  },
];

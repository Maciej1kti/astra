export const iconPaths = {
  focus: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  projects:
    "M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z",
  board:
    "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1M9 3v18M15 3v18",
  calendar:
    "M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1M7 3v4M17 3v4M3 10h18M7 14h2M13 14h2M7 17h2",
  gantt: "M3 4h9v4H3zM8 10h11v4H8zM13 16h8v4h-8z",
  list: "M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01",
  updates: "M5 17V9a7 7 0 0 1 14 0v8l2 2H3l2-2ZM10 22h4",
  settings:
    "m9 3-1 3-3 1-2 4 2 3v4l4 2 3-1 3 1 4-2v-4l2-3-2-4-3-1-1-3H9ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  refresh:
    "M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 2M4 17l2 2a8 8 0 0 0 13-2",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 11v6M12 7h.01",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M18 6 6 18",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  grip: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
  pin: "m9 3 6 0v5l3 3v3H6v-3l3-3V3ZM12 14v7",
  check: "m5 12 4 4L19 6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  flag: "M5 21V4c5-4 9 4 14 0v10c-5 4-9-4-14 0",
} as const;
export type IconName = keyof typeof iconPaths;

import type { GameId } from "../../shared/game-service";

/** Art lives in /public/images/art. `tone` drives the card gradient in CSS (.tone-*). */
export const GAME_META: { id: GameId; icon: string; group: "original" | "cards" | "skill"; rtp: string; art: string; banner: string; square: string; tone: "blue" | "green" | "purple" | "gold" }[] = [
  { id: "crash", icon: "rocket", group: "original", rtp: "90%", art: "/images/art/crash.svg", banner: "/images/games/crash.webp", square: "/images/games/crash-square.webp", tone: "blue" },
  { id: "mines", icon: "gem", group: "original", rtp: "90%", art: "/images/art/mines.svg", banner: "/images/games/mines.webp", square: "/images/games/mines-square.webp", tone: "green" },
  { id: "dice", icon: "dice", group: "skill", rtp: "90%", art: "/images/art/dice.svg", banner: "/images/games/dice.webp", square: "/images/games/dice-square.webp", tone: "purple" },
  { id: "blackjack", icon: "cards", group: "cards", rtp: "≈88%", art: "/images/art/blackjack.svg", banner: "/images/games/blackjack.webp", square: "/images/games/blackjack-square.webp", tone: "gold" },
];
export const artOf = (id: string) => GAME_META.find((g) => g.id === id)?.art ?? "";

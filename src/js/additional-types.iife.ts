import { candlestick, scatter } from "./additional-types";

// For a <script> tag after the one of Tablechart: the types are there for `Tablechart.init()`.
const tablechart = (window as unknown as { Tablechart: { addType: (name: string, type: unknown) => void } }).Tablechart;
tablechart.addType("scatter", scatter);
tablechart.addType("candlestick", candlestick);

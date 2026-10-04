import { create, defaultConfig, init } from "./index.js";

// For a <script> tag: `Tablechart.init()` and `Tablechart.create()`.
(window as unknown as { Tablechart: unknown }).Tablechart = { init, create, defaultConfig };

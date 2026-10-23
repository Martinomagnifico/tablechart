import { addType, create, defaultConfig, init } from "./index.js";
import * as kit from "./kit.js";

// For a <script> tag: `Tablechart.init()` and `Tablechart.create()`. The script with the extras uses `addType` and `kit`.
(window as unknown as { Tablechart: unknown }).Tablechart = { init, create, defaultConfig, addType, kit };

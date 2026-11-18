// If the data of a chart cannot load, the figure has a short message instead of a chart, and the console has the cause.
import { type Config, LIBRARY_NAME } from "../../config";

export const FAILURE_CLASS = "tablechart-load-error";

// The key for a translation script, the same for every chart, as the message is.
const KEY = "tablechart-load-error";

export type Step = "fetch" | "parse" | "transform" | "check";

/** Puts the message in the figure, after its caption, where the chart would be, and names the cause in the console. */
export const fail = (figure: HTMLElement, config: Config, src: string, step: Step, cause: string): void => {
	figure.querySelector(`:scope > .${FAILURE_CLASS}`)?.remove();
	const message = document.createElement("p");
	message.className = FAILURE_CLASS;
	message.setAttribute("role", "status");
	message.textContent = config.loaderror;
	if (config.langattribute) message.setAttribute(config.langattribute, KEY);

	const caption = figure.querySelector(":scope > figcaption");

	if (caption) caption.after(message);
	else figure.prepend(message);

	const local = window.location.protocol === "file:" && step === "fetch";

	console.warn(
		`[${LIBRARY_NAME}] The chart data in "${src}" could not be loaded, at the ${step} step: ${cause}.` +
			(local ? " A page opened as a file cannot fetch files; open it from a server." : ""),
		figure
	);
};

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "../../assets/globals.css";

console.log("VectorTrace popup main.tsx executed!");

const rootEl = document.getElementById("root");
if (rootEl) {
	console.log("Root element found!");
	ReactDOM.createRoot(rootEl).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
	);
} else {
	console.error("Root element NOT found!");
}

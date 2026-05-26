import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "../../assets/globals.css";

// biome-ignore lint/style/noNonNullAssertion: Root element is guaranteed in HTML template
ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "../../popup/components/ErrorBoundary";
import App from "./App";
import "../../assets/globals.css";

// biome-ignore lint/style/noNonNullAssertion: Root element is guaranteed in HTML template
ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<ErrorBoundary>
			<App />
		</ErrorBoundary>
	</React.StrictMode>,
);

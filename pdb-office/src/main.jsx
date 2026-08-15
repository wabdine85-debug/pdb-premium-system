import React from "react";
import { createRoot } from "react-dom/client";
import CRM from "../crm-system.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CRM />
  </React.StrictMode>
);

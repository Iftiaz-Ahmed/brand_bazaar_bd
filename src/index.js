/*!

=========================================================
* Light Bootstrap Dashboard React - v2.0.1
=========================================================

… (header left as-is)
*/

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Switch, Redirect } from "react-router-dom";

import "bootstrap/dist/css/bootstrap.min.css";
import "./assets/css/animate.min.css";
import "./assets/scss/light-bootstrap-dashboard-react.scss?v=2.0.0";
import "./assets/css/demo.css";
import "@fortawesome/fontawesome-free/css/all.min.css";

import AdminLayout from "layouts/Admin.js";
import Login from "views/Login";

// 🔐 add these:
import { AuthProvider } from "./context/AuthProvider";
import ProtectedRoute from "./components/ProtectedRoute";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <AuthProvider>
    <BrowserRouter>
      <Switch>
        {/* PUBLIC: Login */}
        <Route path="/login" component={Login} />

        {/* PROTECTED: Admin */}
        <ProtectedRoute path="/admin">
          <AdminLayout />
        </ProtectedRoute>

        {/* DEFAULT REDIRECT */}
        <Redirect from="/" to="/login" />
      </Switch>
    </BrowserRouter>
  </AuthProvider>
);

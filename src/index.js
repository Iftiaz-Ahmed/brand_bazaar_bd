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

import { AuthProvider } from "./context/AuthProvider";
import ProtectedRoute from "./components/ProtectedRoute";
import GuestRoute from "./components/GuestRoute";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <AuthProvider>
    <BrowserRouter>
      <Switch>
        {/* 🚪 Only guests can visit /login */}
        <GuestRoute exact path="/login">
          <Login />
        </GuestRoute>

        {/* 🔐 All /admin routes are protected */}
        <ProtectedRoute path="/admin">
          <AdminLayout />
        </ProtectedRoute>

        {/* 🌐 Default route */}
        <Route
          path="/"
          render={() => <Redirect to="/admin/dashboard" />}
        />
      </Switch>
    </BrowserRouter>
  </AuthProvider>
);

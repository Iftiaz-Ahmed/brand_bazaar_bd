// src/components/GuestRoute.js
import React from "react";
import { Route, Redirect } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";

export default function GuestRoute({ children, ...rest }) {
  const { user, authLoading } = useAuth();

  return (
    <Route
      {...rest}
      render={() => {
        if (authLoading) return null; // or a loader
        // If logged in -> push to dashboard
        return user ? <Redirect to="/admin/dashboard" /> : children;
      }}
    />
  );
}

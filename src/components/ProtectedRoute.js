import React from "react";
import { Route, Redirect } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";

export default function ProtectedRoute({ children, ...rest }) {
  const { user, authLoading } = useAuth();

  return (
    <Route
      {...rest}
      render={() => {
        if (authLoading) return null; // or a spinner component
        return user ? children : <Redirect to="/login" />;
      }}
    />
  );
}

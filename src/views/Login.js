import React, { useState } from "react";
import bgImage from "../assets/img/loginbg.jpeg";
import { useAuth } from "../context/AuthProvider"; // <-- use the global auth
// If you want to redirect after login and you're on React Router v5:
import { useHistory } from "react-router-dom";

function Login() {
  const history = useHistory(); // remove if you don't want redirect
  const { signIn, signUp, signOut, user, authLoading, authError } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localErr, setLocalErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    setLocalErr("");
    setLoading(true);
    const { error } = await signUp({ email, password });
    setLoading(false);
    if (error) return setLocalErr(error.message);
    history.push("/admin/dashboard");
  };

  const handleLogin = async () => {
    setLocalErr("");
    setLoading(true);
    const { error } = await signIn({ email, password });
    setLoading(false);
    if (error) return setLocalErr(error.message);
    // redirect after successful login
    history.push("/admin/dashboard");
  };

  const handleLogOut = async () => {
    setLocalErr("");
    setLoading(true);
    const { error } = await signOut(); // <-- no args
    setLoading(false);
    if (error) return setLocalErr(error.message);
  };

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        backgroundImage: `url(${bgImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(2px)",
        }}
      />
      <div
        className="d-flex justify-content-center align-items-center"
        style={{ height: "100%", position: "relative", zIndex: 2 }}
      >
        <div className="col-md-4 col-sm-8 col-11">
          <div className="card" style={{ borderRadius: "12px" }}>
            <div className="card-header text-center">
              <h4 className="card-title">Login</h4>
              <p className="card-category">Access Brand Bazaar BD dashboard</p>
            </div>

            <div className="card-body">
              {(localErr || authError) && (
                <p className="text-danger">{localErr || authError}</p>
              )}
              {loading || authLoading ? <p>Please wait…</p> : null}

              <input
                type="email"
                placeholder="Email"
                value={email}
                className="form-control mb-2"
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                className="form-control mb-3"
                onChange={(e) => setPassword(e.target.value)}
              />

              <div className="d-flex gap-2">
                <button
                  className="btn btn-danger"
                  onClick={handleLogin}
                //   disabled={loading || authLoading || !email || !password}
                >
                  Login
                </button>
              </div>
            </div>
          </div>

          <p className="text-center text-light mt-3" style={{ fontSize: "12px" }}>
            © {new Date().getFullYear()} Brand Bazaar BD
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;

import React, { useState } from "react";
import { useAuth } from "context/AuthProvider";
import { supabase } from "createClient";
import { Button, Card, Form, Container, Row, Col } from "react-bootstrap";

function User() {
  const { user } = useAuth();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");

    if (!oldPassword || !newPassword || !confirm)
      return setErr("Please fill in all fields.");
    if (newPassword.length < 8)
      return setErr("New password must be at least 8 characters.");
    if (newPassword !== confirm)
      return setErr("New password and confirmation do not match.");

    setLoading(true);

    // Step 1: Verify old password by signing in again
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPassword,
    });

    if (verifyError) {
      setLoading(false);
      return setErr("Incorrect current password. Please try again.");
    }

    // Step 2: Update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setLoading(false);

    if (updateError) {
      setErr(updateError.message);
    } else {
      setMsg("Password updated successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirm("");
    }
  };

  return (
    <Container fluid>
      <Row>
        <Col md="8">
          <Card>
            <Card.Header>
              <Card.Title as="h4">Change Password</Card.Title>
              <p className="card-category">
                Signed in as <b>{user?.email}</b>
              </p>
            </Card.Header>
            <Card.Body>
              <Form onSubmit={handleUpdatePassword}>
                <Form.Group className="mb-3">
                  <Form.Label>Current Password</Form.Label>
                  <Form.Control
                    type="password"
                    placeholder="Enter your current password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>New Password</Form.Label>
                  <Form.Control
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label>Confirm New Password</Form.Label>
                  <Form.Control
                    type="password"
                    placeholder="Re-enter new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </Form.Group>

                {err && <div className="text-danger mb-2">{err}</div>}
                {msg && <div className="text-success mb-2">{msg}</div>}

                <Button
                  className="btn-fill pull-right"
                  type="submit"
                  variant="info"
                  disabled={loading}
                >
                  {loading ? "Updating..." : "Update Password"}
                </Button>
                <div className="clearfix"></div>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        <Col md="4">
          <Card className="card-user">
            <div className="card-image">
              <img
                alt="..."
                src={require("assets/img/photo-1431578500526-4d9613015464.jpeg")}
              />
            </div>
            <Card.Body>
              <div className="author text-center">
                <img
                  alt="..."
                  className="avatar border-gray"
                  src={require("assets/img/faces/face-3.jpg")}
                />
                <div>
                  <h5 className="title mt-2">{user?.email}</h5>
                </div>
              </div>
              <p className="description text-center mt-3">
                Use a strong password that you haven't used elsewhere.
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default User;

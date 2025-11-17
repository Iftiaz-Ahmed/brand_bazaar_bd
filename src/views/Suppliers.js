import React, { useState, useEffect } from "react";
import {
  Card,
  Table,
  Container,
  Row,
  Col,
  Form,
  Button,
  Collapse,
} from "react-bootstrap";
import { supabase } from "createClient";

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");

  // Add supplier form state
  const [newSupplier, setNewSupplier] = useState({
    organization_name: "",
    contact_name: "",
    phone: "",
    email: "",
    address: "",
    website: "",
    notes: "",
  });
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Edit supplier state (custom modal)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [editForm, setEditForm] = useState({
    organization_name: "",
    contact_name: "",
    phone: "",
    email: "",
    address: "",
    website: "",
    notes: "",
  });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    async function fetchSuppliers() {
      const { data, error } = await supabase.from("supplier").select("*");

      if (error) {
        console.error("Supabase error:", error);
      } else {
        // newest first
        setSuppliers(data.reverse());
      }
    }

    fetchSuppliers();
  }, []);

  function fixUrl(url) {
    if (!url) return "#";
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return "https://" + url;
    }
    return url;
  }

  // 🔍 filter logic
  const filteredSuppliers = suppliers.filter((s) => {
    const term = search.toLowerCase();
    return (
      s.organization_name?.toLowerCase().includes(term) ||
      s.name?.toLowerCase().includes(term) ||
      s.contact_name?.toLowerCase().includes(term) ||
      s.email?.toLowerCase().includes(term) ||
      s.phone?.toLowerCase().includes(term) ||
      s.address?.toLowerCase().includes(term) ||
      s.notes?.toLowerCase().includes(term)
    );
  });

  // ------- Add supplier handlers -------

  const handleNewSupplierChange = (e) => {
    const { name, value } = e.target;
    setNewSupplier((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddSupplier = async (e) => {
    e.preventDefault();
    setAddError("");

    if (!newSupplier.organization_name && !newSupplier.name) {
      setAddError("Organization name is required.");
      return;
    }

    try {
      setAdding(true);

      const payload = {
        organization_name: newSupplier.organization_name || newSupplier.name || "",
        contact_name: newSupplier.contact_name || "",
        phone: newSupplier.phone || "",
        email: newSupplier.email || "",
        address: newSupplier.address || "",
        website: newSupplier.website || "",
        notes: newSupplier.notes || "",
      };

      const { data, error } = await supabase
        .from("supplier")
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error("Supabase insert error:", error);
        setAddError(error.message || "Failed to add supplier.");
      } else {
        setSuppliers((prev) => [data, ...prev]);
        setNewSupplier({
          organization_name: "",
          contact_name: "",
          phone: "",
          email: "",
          address: "",
          website: "",
          notes: "",
        });
      }
    } finally {
      setAdding(false);
    }
  };

  // ------- Delete supplier -------

  const handleDeleteSupplier = async (supplier) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this supplier?"
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("supplier")
      .delete()
      .eq("id", supplier.id);

    if (error) {
      console.error("Supabase delete error:", error);
      alert(error.message || "Failed to delete supplier.");
    } else {
      setSuppliers((prev) => prev.filter((s) => s.id !== supplier.id));
    }
  };

  // ------- Edit supplier -------

  const openEditModal = (supplier) => {
    setEditingSupplier(supplier);
    setEditForm({
      organization_name: supplier.organization_name || supplier.name || "",
      contact_name: supplier.contact_name || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      website: supplier.website || "",
      notes: supplier.notes || "",
      updated_at: new Date().toISOString()
    });
    setEditError("");
    setShowEditModal(true);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingSupplier) return;

    setEditError("");

    if (!editForm.organization_name) {
      setEditError("Organization name is required.");
      return;
    }

    try {
      setSavingEdit(true);

      const payload = {
        organization_name: editForm.organization_name,
        contact_name: editForm.contact_name || "",
        phone: editForm.phone || "",
        email: editForm.email || "",
        address: editForm.address || "",
        website: editForm.website || "",
        notes: editForm.notes || "",
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from("supplier")
        .update(payload)
        .eq("id", editingSupplier.id)
        .select()
        .single();

      if (error) {
        console.error("Supabase update error:", error);
        setEditError(error.message || "Failed to update supplier.");
      } else {
        setSuppliers((prev) =>
          prev.map((s) => (s.id === editingSupplier.id ? data : s))
        );
        setShowEditModal(false);
        setEditingSupplier(null);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <>
      <Container fluid>
        <Row>
          <Col md="12">
            <Card className="strpied-tabled-with-hover">
              <Card.Header>
                <Card.Title as="h4">Suppliers</Card.Title>
                <p className="card-category">
                  Contact details of all suppliers
                </p>

                {/* 🔍 Search bar */}
                <Form.Control
                  type="text"
                  placeholder="Search by name, email, phone, address..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mt-3 mb-3"
                />

                {/* Toggle Add Supplier form */}
                <div className="d-flex justify-content-start mb-2">
                  <Button
                    variant={showForm ? "danger" : "info"}
                    onClick={() => setShowForm((prev) => !prev)}
                  >
                    {showForm ? "Close" : "Add New Supplier"}
                  </Button>
                </div>

                {/* ➕ Add Supplier mini-form (sliding) */}
                <Collapse in={showForm}>
                  <div>
                    <Form onSubmit={handleAddSupplier} className="border-top pt-3">
                      <Row>
                        <Col md={4} className="mb-2">
                          <Form.Label>Organization Name *</Form.Label>
                          <Form.Control
                            name="organization_name"
                            value={newSupplier.organization_name}
                            onChange={handleNewSupplierChange}
                            placeholder="Organization name"
                          />
                        </Col>
                        <Col md={4} className="mb-2">
                          <Form.Label>Contact Name</Form.Label>
                          <Form.Control
                            name="contact_name"
                            value={newSupplier.contact_name}
                            onChange={handleNewSupplierChange}
                            placeholder="Contact person"
                          />
                        </Col>
                        <Col md={4} className="mb-2">
                          <Form.Label>Phone</Form.Label>
                          <Form.Control
                            name="phone"
                            value={newSupplier.phone}
                            onChange={handleNewSupplierChange}
                            placeholder="Phone"
                          />
                        </Col>
                      </Row>
                      <Row>
                        <Col md={4} className="mb-2">
                          <Form.Label>Email</Form.Label>
                          <Form.Control
                            name="email"
                            type="email"
                            value={newSupplier.email}
                            onChange={handleNewSupplierChange}
                            placeholder="Email"
                          />
                        </Col>
                        <Col md={4} className="mb-2">
                          <Form.Label>Website</Form.Label>
                          <Form.Control
                            name="website"
                            value={newSupplier.website}
                            onChange={handleNewSupplierChange}
                            placeholder="example.com"
                          />
                        </Col>
                        <Col md={4} className="mb-2">
                          <Form.Label>Address</Form.Label>
                          <Form.Control
                            name="address"
                            value={newSupplier.address}
                            onChange={handleNewSupplierChange}
                            placeholder="Address"
                          />
                        </Col>
                      </Row>
                      <Row>
                        <Col md={12} className="mb-2">
                          <Form.Label>Notes</Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={2}
                            name="notes"
                            value={newSupplier.notes}
                            onChange={handleNewSupplierChange}
                            placeholder="Additional notes"
                          />
                        </Col>
                      </Row>

                      <div className="d-flex justify-content-end mt-2">
                        {addError && (
                          <div className="text-danger mb-1 mr-2">{addError}</div>
                        )}
                        <Button
                          type="submit"
                          variant="info"
                          className="btn-fill"
                          disabled={adding}
                        >
                          {adding ? "Adding..." : "Save Supplier"}
                        </Button>
                      </div>
                    </Form>
                  </div>
                </Collapse>
              </Card.Header>

              <Card.Body className="table-full-width table-responsive px-0">
                <Table className="table-hover table-striped">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Organization Name</th>
                      <th>Contact Name</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Address</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredSuppliers.length > 0 ? (
                      filteredSuppliers.map((supplier) => (
                        <tr key={supplier.id}>
                          <td>{supplier.id}</td>
                          <td>
                            <a
                              href={fixUrl(supplier.website)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {supplier.organization_name ||
                                supplier.name ||
                                "Unnamed Supplier"}
                            </a>
                          </td>
                          <td>{supplier.contact_name}</td>
                          <td>{supplier.phone}</td>
                          <td>{supplier.email}</td>
                          <td>{supplier.address}</td>
                          <td>{supplier.notes}</td>
                          <td className="d-flex align-items-center gap-2">
                            <Button
                                variant="info"
                                size="sm"
                                className="mr-1"
                                onClick={() => openEditModal(supplier)}
                            >
                                Edit
                            </Button>
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeleteSupplier(supplier)}
                                >
                                Delete
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="text-center text-danger py-3">
                          No suppliers found!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      {/* ✏️ EDIT SUPPLIER - CUSTOM MODAL */}
      {showEditModal && (
        <div
          onClick={() => !savingEdit && setShowEditModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
        >
          <div
            className="card"
            style={{
              width: "90%",
              maxWidth: "800px",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header d-flex justify-content-between align-items-center">
              <h4 className="mb-0">Edit Supplier</h4>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => !savingEdit && setShowEditModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="card-body">
              {editError && (
                <div className="text-danger mb-2">{editError}</div>
              )}

              <Form onSubmit={handleSaveEdit}>
                <Row>
                  <Col md={6} className="mb-2">
                    <Form.Label>Organization Name *</Form.Label>
                    <Form.Control
                      name="organization_name"
                      value={editForm.organization_name}
                      onChange={handleEditChange}
                    />
                  </Col>
                  <Col md={6} className="mb-2">
                    <Form.Label>Contact Name</Form.Label>
                    <Form.Control
                      name="contact_name"
                      value={editForm.contact_name}
                      onChange={handleEditChange}
                    />
                  </Col>
                </Row>
                <Row>
                  <Col md={4} className="mb-2">
                    <Form.Label>Phone</Form.Label>
                    <Form.Control
                      name="phone"
                      value={editForm.phone}
                      onChange={handleEditChange}
                    />
                  </Col>
                  <Col md={4} className="mb-2">
                    <Form.Label>Email</Form.Label>
                    <Form.Control
                      name="email"
                      type="email"
                      value={editForm.email}
                      onChange={handleEditChange}
                    />
                  </Col>
                  <Col md={4} className="mb-2">
                    <Form.Label>Website</Form.Label>
                    <Form.Control
                      name="website"
                      value={editForm.website}
                      onChange={handleEditChange}
                    />
                  </Col>
                </Row>
                <Row>
                  <Col md={12} className="mb-2">
                    <Form.Label>Address</Form.Label>
                    <Form.Control
                      name="address"
                      value={editForm.address}
                      onChange={handleEditChange}
                    />
                  </Col>
                </Row>
                <Row>
                  <Col md={12} className="mb-2">
                    <Form.Label>Notes</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      name="notes"
                      value={editForm.notes}
                      onChange={handleEditChange}
                    />
                  </Col>
                </Row>

                <div className="d-flex justify-content-end mt-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="mr-2"
                    onClick={() => !savingEdit && setShowEditModal(false)}
                    disabled={savingEdit}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="info"
                    className="btn-fill"
                    disabled={savingEdit}
                  >
                    {savingEdit ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </Form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Suppliers;

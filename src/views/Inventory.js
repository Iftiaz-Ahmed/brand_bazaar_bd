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
import { formatDate } from "../utils/formatDate";
import * as QRCode from "qrcode";

const COMPANY_NAME = "Brand Bazaar BD";
const COMPANY_LOGO_URL =
  "https://wujdkjvthzqnzbbczykd.supabase.co/storage/v1/object/public/assets/reactlogo.png";

// 🔹 Helper: current local time for datetime-local input ("YYYY-MM-DDTHH:mm")
function getNowForDatetimeLocal() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000; // minutes -> ms
  const localISO = new Date(now.getTime() - tzOffset).toISOString();
  return localISO.slice(0, 16);
}

// 🔹 Helper: UTC ISO from DB -> local "YYYY-MM-DDTHH:mm" (for edit input)
function utcToLocalDatetimeLocal(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const tzOffset = d.getTimezoneOffset() * 60000;
  const localISO = new Date(d.getTime() - tzOffset).toISOString();
  return localISO.slice(0, 16);
}

const Inventory = () => {
  const [cartons, setCartons] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);

  // Add new carton form state
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  // one-at-a-time QR generator guard (per row)
  const [qrBusyId, setQrBusyId] = useState(null);

  const [newCarton, setNewCarton] = useState({
    product_id: "",
    status: "received",
    units_remaining: "",
    // datetime-local string in local timezone
    received_at: getNowForDatetimeLocal(),
    supplier_id: "",
    is_open: false,
  });

  // product search (add)
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // product search (edit)
  const [editProductSearch, setEditProductSearch] = useState("");
  const [showEditProductDropdown, setShowEditProductDropdown] =
    useState(false);

  // EDIT modal state (custom overlay)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCarton, setEditingCarton] = useState(null);
  const [editData, setEditData] = useState({
    product_id: "",
    status: "received",
    units_remaining: "",
    statusDate: "", // dynamic date tied to statuss
    supplier_id: "",
    is_open: "no", // "yes" | "no"
  });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // ---- helpers for status/date ----
  const getStatusDateKey = (status) => {
    if (status === "shipped") return "shipped_at";
    if (status === "delivered") return "delivered_at";
    return "received_at";
  };

  const getStatusDateLabel = (status) => {
    if (status === "shipped") return "Shipped At";
    if (status === "delivered") return "Delivered At";
    return "Received At";
  };

  useEffect(() => {
    async function fetchCartons() {
      const { data, error } = await supabase
        .from("cartons")
        .select("*")
        .order("id", { ascending: false }); // always newest first

      if (error) {
        console.error("Supabase error (cartons):", error);
      } else {
        setCartons(data || []);
      }
    }

    async function fetchSuppliers() {
      const { data, error } = await supabase.from("supplier").select("*");
      if (error) {
        console.error("Supabase error (suppliers):", error);
      } else {
        setSuppliers(data || []);
      }
    }

    async function fetchProducts() {
      const { data, error } = await supabase.from("products").select("*");
      if (error) {
        console.error("Supabase error (products):", error);
      } else {
        setProducts(data || []);
      }
    }

    fetchCartons();
    fetchSuppliers();
    fetchProducts();
  }, []);

  function getSupplierName(id) {
    const supplier = suppliers.find((s) => s.id === id);
    return supplier ? supplier.organization_name : "Unknown Supplier";
  }

  function getProductName(id) {
    const product = products.find((p) => p.id === id);
    return product ? product.name : "Unknown Product";
  }

  function getStatusTime(carton) {
    if (carton.status === "received") return carton.received_at;
    if (carton.status === "shipped") return carton.shipped_at;
    if (carton.status === "delivered") return carton.delivered_at;
    return null;
  }

  const handleNewCartonChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewCarton((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // ---------- utils ----------
  async function dataURLToFile(dataUrl, filename) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: "image/png" });
  }

  async function loadImage(src) {
    if (!src) return null;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Helper: draw wrapped text and return the y after drawing
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    if (!text) return y;
    const words = String(text).split(/\s+/);
    let line = "";

    for (let n = 0; n < words.length; n++) {
      const testLine = line ? line + " " + words[n] : words[n];
      const { width } = ctx.measureText(testLine);
      if (width > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n];
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) ctx.fillText(line, x, y);
    return y;
  }

  // 🔥 Generate a "label-style" image: logo + text + QR
  async function generateCartonLabelImage(carton, product, unitsRemaining) {
    const qrPayload = `carton${carton.id}`;
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      margin: 1,
      width: 260,
    });

    // Canvas
    const width = 800;
    const height = 460;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Background + border
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, width - 4, height - 4);

    // Layout constants
    const paddingLeft = 40;
    const paddingTop = 30;
    const gutter = 30;
    const qrSize = 260;
    const qrX = width - qrSize - 60;
    const qrY = (height - qrSize) / 2;

    // Logo
    const logoSize = 150;
    const logoImg = await loadImage(COMPANY_LOGO_URL);
    if (logoImg) {
      const logoX = 100;
      const logoY = paddingTop;
      ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
    }

    // Text area
    let currentY = paddingTop + logoSize + 20;
    const maxTextRight = qrX - gutter;
    const maxTextWidth = Math.max(120, maxTextRight - paddingLeft);

    ctx.fillStyle = "#111111";
    ctx.textBaseline = "top";
    ctx.font = "bold 36px Arial";
    ctx.fillText(COMPANY_NAME, paddingLeft, currentY);
    currentY += 48;

    // Product name (wrapped)
    ctx.font = "28px Arial";
    currentY = wrapText(
      ctx,
      `Product: ${product?.name || "Unknown Product"}`,
      paddingLeft,
      currentY,
      maxTextWidth,
      34
    );
    currentY += 48;

    // Units line
    ctx.font = "20px Arial";
    ctx.fillText(`Units in Carton: ${unitsRemaining}`, paddingLeft, currentY);
    currentY += 34;

    // QR on right
    const qrImg = await loadImage(qrDataUrl);
    if (qrImg) {
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    }

    return canvas.toDataURL("image/png");
  }

  // 🔁 GENERAL HELPER: create or update label in storage + update qr_code_url
  async function createOrUpdateCartonLabel(carton, units, productOverride) {
    const product =
      productOverride ||
      products.find((p) => p.id === carton.product_id) ||
      null;

    const labelDataUrl = await generateCartonLabelImage(
      carton,
      product,
      units
    );

    const fileName = `carton_${carton.id}.png`;
    const filePath = fileName;
    const file = await dataURLToFile(labelDataUrl, fileName);

    const { error: uploadError } = await supabase.storage
      .from("qr_code_cartons")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error("Supabase upload error (label):", uploadError);
      throw new Error(uploadError.message || "Failed to upload label image.");
    }

    const { data: publicData } = await supabase.storage
      .from("qr_code_cartons")
      .getPublicUrl(filePath);

    const baseUrl = publicData?.publicUrl || null;
    const qrUrl = baseUrl ? `${baseUrl}?v=${Date.now()}` : null;

    const { data: finalCarton, error: finalUpdateError } = await supabase
      .from("cartons")
      .update({ qr_code_url: qrUrl })
      .eq("id", carton.id)
      .select()
      .single();

    if (finalUpdateError) {
      console.error(
        "Supabase final update error (qr_code_url):",
        finalUpdateError
      );
      throw new Error(finalUpdateError.message || "Failed to save label URL.");
    }

    return finalCarton;
  }

  function handlePrintLabel(url) {
    if (!url) return;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
        <html>
        <head>
            <title>Print Carton Label</title>
        </head>
        <body style="margin:0;display:flex;align-items:center;justify-content:center;">
            <img
            src="${url}"
            style="max-width:100%;max-height:100%;"
            onload="window.print();window.close();"
            />
        </body>
        </html>
    `);
    printWindow.document.close();
    }


  // ADD CARTON
  const handleAddCarton = async (e) => {
    e.preventDefault();
    setAddError("");

    if (!newCarton.product_id) return setAddError("Please select a product.");
    if (!newCarton.units_remaining)
      return setAddError("Please enter units remaining.");

    try {
      setAdding(true);

      const receivedAtIso = newCarton.received_at
        ? new Date(newCarton.received_at).toISOString()
        : new Date().toISOString();

      const units = Number(newCarton.units_remaining);

      const insertPayload = {
        product_id: Number(newCarton.product_id),
        status: newCarton.status || "received",
        units_remaining: units,
        received_at: receivedAtIso,
        supplier_id: newCarton.supplier_id
          ? Number(newCarton.supplier_id)
          : null,
        is_open: false,
      };

      const { data: insertedCarton, error: insertError } = await supabase
        .from("cartons")
        .insert([insertPayload])
        .select()
        .single();

      if (insertError) {
        console.error("Supabase insert error (carton):", insertError);
        setAddError(insertError.message || "Failed to add carton.");
        return;
      }

      const product = products.find((p) => p.id === insertedCarton.product_id);
      const finalCarton = await createOrUpdateCartonLabel(
        insertedCarton,
        units,
        product
      );

      // prepend and keep sorted (id desc)
      setCartons((prev) =>
        [finalCarton, ...prev].sort((a, b) => b.id - a.id)
      );

      setNewCarton({
        product_id: "",
        status: "received",
        units_remaining: "",
        received_at: getNowForDatetimeLocal(),
        supplier_id: "",
        is_open: false,
      });
      setProductSearch("");
      setShowProductDropdown(false);
    } catch (err) {
      console.error("Unexpected error adding carton:", err);
      setAddError(err?.message || "Unexpected error while adding carton.");
    } finally {
      setAdding(false);
    }
  };

  // GENERATE / REGENERATE LABEL FOR EXISTING CARTON
  async function handleGenerateQrForCarton(carton) {
    try {
      setQrBusyId(carton.id);

      const product = products.find((p) => p.id === carton.product_id);
      const units = Number(carton.units_remaining) || 0;

      const finalCarton = await createOrUpdateCartonLabel(
        carton,
        units,
        product
      );

      setCartons((prev) =>
        prev
          .map((c) => (c.id === finalCarton.id ? finalCarton : c))
          .sort((a, b) => b.id - a.id)
      );
    } catch (err) {
      console.error("Unexpected error generating QR:", err);
      alert(err?.message || "Unexpected error generating QR.");
    } finally {
      setQrBusyId(null);
    }
  }

  // DELETE CARTON (and its label image)
  async function handleDeleteCarton(carton) {
    const confirmed = window.confirm(
      `Delete Carton ${carton.id}? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const fileName = `carton_${carton.id}.png`;
      await supabase.storage.from("qr_code_cartons").remove([fileName]);

      const { error } = await supabase
        .from("cartons")
        .delete()
        .eq("id", carton.id);

      if (error) {
        console.error("Supabase delete error (carton):", error);
        alert(error.message || "Failed to delete carton.");
        return;
      }

      setCartons((prev) => prev.filter((c) => c.id !== carton.id));
    } catch (err) {
      console.error("Unexpected delete error:", err);
      alert(err?.message || "Unexpected error while deleting carton.");
    }
  }

  // EDIT CARTON
  function openEditModal(carton) {
    setEditingCarton(carton);
    setEditError("");

    const product = products.find((p) => p.id === carton.product_id);
    const status = carton.status || "received";
    const dateKey = getStatusDateKey(status);
    const rawDate = carton[dateKey];

    setEditData({
      product_id: carton.product_id || "",
      status,
      units_remaining:
        carton.units_remaining !== null ? String(carton.units_remaining) : "",
      // convert UTC from DB -> local string for datetime-local input
      statusDate: rawDate ? utcToLocalDatetimeLocal(rawDate) : "",
      supplier_id: carton.supplier_id || "",
      is_open: carton.is_open ? "yes" : "no",
    });

    setEditProductSearch(product?.name || "");
    setShowEditModal(true);
  }

  function closeEditModal() {
    setShowEditModal(false);
    setEditingCarton(null);
  }

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === "is_open") {
      setEditData((prev) => ({ ...prev, is_open: value }));
      return;
    }

    if (name === "status") {
      // just update status; date field uses statusDate as-is until user changes it
      setEditData((prev) => ({
        ...prev,
        status: value,
      }));
      return;
    }

    setEditData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  async function handleUpdateCarton(e) {
    e.preventDefault();
    if (!editingCarton) return;
    setEditError("");

    if (!editData.product_id) {
      setEditError("Please select a product.");
      return;
    }
    if (!editData.units_remaining) {
      setEditError("Please enter units remaining.");
      return;
    }

    try {
      setSavingEdit(true);

      const units = Number(editData.units_remaining);
      const status = editData.status || "received";
      const dateKey = getStatusDateKey(status);

      const payload = {
        product_id: Number(editData.product_id),
        status,
        units_remaining: units,
        supplier_id: editData.supplier_id
          ? Number(editData.supplier_id)
          : null,
        is_open: editData.is_open === "yes",
        updated_at: new Date().toISOString(),
      };

      // Only write the status-specific date (received_at/shipped_at/delivered_at)
      if (editData.statusDate) {
        payload[dateKey] = new Date(editData.statusDate).toISOString();
      }

      // 1) Update carton fields
      const { data: updatedCarton, error: updateError } = await supabase
        .from("cartons")
        .update(payload)
        .eq("id", editingCarton.id)
        .select()
        .single();

      if (updateError) {
        console.error("Supabase update error (carton edit):", updateError);
        setEditError(updateError.message || "Failed to update carton.");
        return;
      }

      // 2) Regenerate label + update qr_code_url
      const product = products.find((p) => p.id === updatedCarton.product_id);
      const finalCarton = await createOrUpdateCartonLabel(
        updatedCarton,
        units,
        product
      );

      // 3) Update UI & keep sort order
      setCartons((prev) =>
        prev
          .map((c) => (c.id === finalCarton.id ? finalCarton : c))
          .sort((a, b) => b.id - a.id)
      );

      closeEditModal();
    } catch (err) {
      console.error("Unexpected edit error:", err);
      setEditError(err?.message || "Unexpected error updating carton.");
    } finally {
      setSavingEdit(false);
    }
  }

  // product search dropdown for ADD form
  const filteredProducts = products.filter((p) =>
    (p.name || "").toLowerCase().includes(productSearch.toLowerCase())
  );

  const handleProductSearchChange = (e) => {
    const value = e.target.value;
    setProductSearch(value);
    setShowProductDropdown(true);
  };

  const handleSelectProduct = (product) => {
    setNewCarton((prev) => ({ ...prev, product_id: product.id }));
    setProductSearch(product.name || "");
    setShowProductDropdown(false);
  };

  // product search for EDIT modal
  const filteredEditProducts = products.filter((p) =>
    (p.name || "").toLowerCase().includes(editProductSearch.toLowerCase())
  );

  const handleEditProductSearchChange = (e) => {
    const value = e.target.value;
    setEditProductSearch(value);
    setShowEditProductDropdown(true);
  };

  const handleSelectEditProduct = (product) => {
    setEditData((prev) => ({
      ...prev,
      product_id: product.id,
    }));
    setEditProductSearch(product.name || "");
    setShowEditProductDropdown(false);
  };

  const editStatusLabel = getStatusDateLabel(editData.status);

  return (
    <Container fluid>
      <Row>
        <Col md="12">
          <Card className="strpied-tabled-with-hover">
            <Card.Header>
              <Card.Title as="h4">Inventory</Card.Title>
              <p className="card-category">
                Current available stock and their status
              </p>

              <div className="d-flex justify-content-start mb-2 mt-3">
                <Button
                  variant={showForm ? "danger" : "info"}
                  onClick={() => setShowForm((prev) => !prev)}
                >
                  {showForm ? "Close" : "Add New Carton"}
                </Button>
              </div>

              <Collapse in={showForm}>
                <div>
                  <Form onSubmit={handleAddCarton} className="border-top pt-3">
                    <Row>
                      <Col md={4} className="mb-2 position-relative">
                        <Form.Label>Product *</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="Type product name..."
                          value={productSearch}
                          onChange={handleProductSearchChange}
                          onFocus={() => setShowProductDropdown(true)}
                        />
                        {showProductDropdown &&
                          filteredProducts.length > 0 && (
                            <div
                              style={{
                                position: "absolute",
                                top: "100%",
                                left: 0,
                                right: 0,
                                maxHeight: "200px",
                                overflowY: "auto",
                                background: "#fff",
                                border: "1px solid #ddd",
                                borderRadius: "4px",
                                zIndex: 10,
                              }}
                            >
                              {filteredProducts.map((prod) => (
                                <div
                                  key={prod.id}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleSelectProduct(prod)}
                                  style={{
                                    padding: "6px 10px",
                                    cursor: "pointer",
                                  }}
                                >
                                  {prod.name}{" "}
                                  {prod.size ? `(${prod.size})` : ""}
                                </div>
                              ))}
                            </div>
                          )}
                      </Col>

                      <Col md={2} className="mb-2">
                        <Form.Label>Status</Form.Label>
                        <Form.Control
                          as="select"
                          name="status"
                          value={newCarton.status}
                          onChange={handleNewCartonChange}
                        >
                          <option value="received">Received</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                        </Form.Control>
                      </Col>

                      <Col md={2} className="mb-2">
                        <Form.Label>Total Units *</Form.Label>
                        <Form.Control
                          type="number"
                          name="units_remaining"
                          value={newCarton.units_remaining}
                          onChange={handleNewCartonChange}
                          placeholder="e.g. 72"
                        />
                      </Col>

                      <Col md={4} className="mb-2">
                        <Form.Label>Received At</Form.Label>
                        <Form.Control
                          type="datetime-local"
                          name="received_at"
                          value={newCarton.received_at}
                          onChange={handleNewCartonChange}
                        />
                        <small className="text-muted">
                          Leave as-is to use current time.
                        </small>
                      </Col>
                    </Row>

                    <Row className="mt-2">
                      <Col md={4} className="mb-2">
                        <Form.Label>Supplier</Form.Label>
                        <Form.Control
                          as="select"
                          name="supplier_id"
                          value={newCarton.supplier_id}
                          onChange={handleNewCartonChange}
                        >
                          <option value="">Select supplier</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.organization_name || s.name || "Supplier"} (
                              {s.id})
                            </option>
                          ))}
                        </Form.Control>
                      </Col>

                      <Col
                        md={{ span: 4, offset: 4 }}
                        className="mb-2 d-flex justify-content-end align-items-end"
                      >
                        <div className="text-right w-100">
                          {addError && (
                            <div className="text-danger mb-1">{addError}</div>
                          )}
                          <Button
                            type="submit"
                            variant="info"
                            className="btn-fill"
                            disabled={adding}
                          >
                            {adding ? "Adding..." : "Save Carton"}
                          </Button>
                        </div>
                      </Col>
                    </Row>
                  </Form>
                </div>
              </Collapse>
            </Card.Header>

            <Card.Body className="table-full-width table-responsive px-0">
              <Table className="table-hover table-striped">
                <thead>
                  <tr>
                    <th className="border-0">ID</th>
                    <th className="border-0">QR Label</th>
                    <th className="border-0">Product</th>
                    <th className="border-0">Units Available</th>
                    <th className="border-0">Supplier Name</th>
                    <th className="border-0">Carton Open</th>
                    <th className="border-0">Status</th>
                    <th className="border-0">Time</th>
                    <th className="border-0">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cartons.length > 0 ? (
                    cartons.map((carton) => (
                      <tr key={carton.id}>
                        <td>Carton {carton.id}</td>
                        <td>
                        {carton.qr_code_url ? (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div
                                onClick={() => setSelectedImage(carton.qr_code_url)}
                                style={{
                                width: "140px",
                                height: "140px",
                                borderRadius: "12px",
                                overflow: "hidden",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                                background: "#fff",
                                cursor: "zoom-in",
                                }}
                            >
                                <img
                                src={carton.qr_code_url}
                                alt={`Carton ${carton.id} Label`}
                                style={{
                                    width: "110%",
                                    height: "110%",
                                    objectFit: "cover",
                                    objectPosition: "right center"
                                }}
                                />
                            </div>

                            {/* 🔹 Print button under the label */}
                            <Button
                                size="sm"
                                variant="outline-info"
                                className="mt-2"
                                onClick={(e) => {
                                e.stopPropagation(); // don't trigger zoom
                                handlePrintLabel(carton.qr_code_url);
                                }}
                            >
                                Print Label
                            </Button>
                            </div>
                        ) : (
                            <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleGenerateQrForCarton(carton)}
                            disabled={qrBusyId === carton.id}
                            >
                            {qrBusyId === carton.id ? "Generating..." : "Get QR Code"}
                            </Button>
                        )}
                        </td>
                        <td>{getProductName(carton.product_id)}</td>
                        <td>{carton.units_remaining}</td>
                        <td>{getSupplierName(carton.supplier_id)}</td>
                        <td>{carton.is_open ? "YES" : "NO"}</td>
                        <td>{(carton.status || "").toUpperCase()}</td>
                        <td>{formatDate(getStatusTime(carton))}</td>
                        <td className="align-middle">
                          <div className="d-flex align-items-center gap-2">
                            <Button
                              variant="link"
                              size="sm"
                              className="p-0 text-warning"
                              onClick={() => openEditModal(carton)}
                            >
                              <i className="fa fa-edit" />
                            </Button>
                            <Button
                              variant="link"
                              size="sm"
                              className="p-0 text-danger ml-2"
                              onClick={() => handleDeleteCarton(carton)}
                            >
                              <i className="fa fa-trash" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="text-center text-danger py-3">
                        No cartons are currently available in the inventory.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* EDIT "MODAL" – custom overlay */}
      {showEditModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1050,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={closeEditModal}
        >
          <div
            className="modal-dialog"
            style={{ maxWidth: "600px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <Form onSubmit={handleUpdateCarton}>
                <div className="modal-header">
                  <h5 className="modal-title">Edit Carton</h5>
                  <button
                    type="button"
                    className="close"
                    onClick={closeEditModal}
                  >
                    <span>&times;</span>
                  </button>
                </div>

                <div className="modal-body">
                  <Row>
                    <Col md={12} className="mb-2 position-relative">
                      <Form.Label>Product *</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Type product name..."
                        value={editProductSearch}
                        onChange={handleEditProductSearchChange}
                        onFocus={() => setShowEditProductDropdown(true)}
                      />
                      {showEditProductDropdown &&
                        filteredEditProducts.length > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              right: 0,
                              maxHeight: "200px",
                              overflowY: "auto",
                              background: "#fff",
                              border: "1px solid #ddd",
                              borderRadius: "4px",
                              zIndex: 10,
                            }}
                          >
                            {filteredEditProducts.map((prod) => (
                              <div
                                key={prod.id}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleSelectEditProduct(prod)}
                                style={{ padding: "6px 10px", cursor: "pointer" }}
                              >
                                {prod.name}{" "}
                                {prod.size ? `(${prod.size})` : ""}
                              </div>
                            ))}
                          </div>
                        )}
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6} className="mb-2">
                      <Form.Label>Status</Form.Label>
                      <Form.Control
                        as="select"
                        name="status"
                        value={editData.status}
                        onChange={handleEditChange}
                      >
                        <option value="received">Received</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                      </Form.Control>
                    </Col>

                    <Col md={6} className="mb-2">
                      <Form.Label>Units Remaining *</Form.Label>
                      <Form.Control
                        type="number"
                        name="units_remaining"
                        value={editData.units_remaining}
                        onChange={handleEditChange}
                      />
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6} className="mb-2">
                      <Form.Label>{editStatusLabel}</Form.Label>
                      <Form.Control
                        type="datetime-local"
                        name="statusDate"
                        value={editData.statusDate}
                        onChange={handleEditChange}
                      />
                    </Col>

                    <Col md={6} className="mb-2">
                      <Form.Label>Supplier</Form.Label>
                      <Form.Control
                        as="select"
                        name="supplier_id"
                        value={editData.supplier_id}
                        onChange={handleEditChange}
                      >
                        <option value="">Select supplier</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.organization_name || s.name || "Supplier"} (
                            {s.id})
                          </option>
                        ))}
                      </Form.Control>
                    </Col>
                  </Row>

                  <Row className="mt-2">
                    <Col md={12}>
                      <Form.Label>Open?</Form.Label>
                      <Form.Control
                        as="select"
                        name="is_open"
                        value={editData.is_open}
                        onChange={handleEditChange}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </Form.Control>
                    </Col>
                  </Row>

                  {editError && (
                    <div className="text-danger mt-2">{editError}</div>
                  )}
                </div>

                <div className="modal-footer">
                  <Button variant="secondary" onClick={closeEditModal}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="info" disabled={savingEdit}>
                    {savingEdit ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </Form>
            </div>
          </div>
        </div>
      )}

      {/* QR zoom modal */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            cursor: "zoom-out",
          }}
        >
          <img
            src={selectedImage}
            alt="QR Label Zoomed"
            style={{
              maxWidth: "90%",
              maxHeight: "90%",
              borderRadius: "12px",
              boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
            }}
          />
        </div>
      )}
    </Container>
  );
};

export default Inventory;

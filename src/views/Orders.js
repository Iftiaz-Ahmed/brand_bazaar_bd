// src/views/Orders.js

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
import * as QRCode from "qrcode"; // not strictly needed here but fine if you already use
// If you have a shared formatDate util you can import & reuse it
import { formatDate } from "../utils/formatDate";

const COMPANY_NAME = "Brand Bazaar BD";
const COMPANY_LOGO_URL =
  "https://wujdkjvthzqnzbbczykd.supabase.co/storage/v1/object/public/assets/reactlogo.png";

// ---------- small helpers ----------

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

// unit-price helper usable everywhere
function getUnitPriceForProductFromList(products, productId) {
  const p = products.find((x) => x.id === productId);
  // adjust the key "unit_selling_price" if your column is named differently
  return p?.unit_selling_price ? Number(p.unit_selling_price) : 0;
}

/**
 * Select cartons for "Auto" mode:
 * - Input: all cartons for a product (status = received, units_remaining > 0)
 * - Goal: pick the FEWEST cartons whose total units >= desiredUnits
 * - Strategy: greedy, pick largest cartons first
 *
 * Returns:
 *   { selectedCartons: Carton[], totalUnits: number } or null if not enough stock
 */
function selectCartonsForAuto(cartonsForProduct, desiredUnits) {
  if (!Array.isArray(cartonsForProduct) || cartonsForProduct.length === 0) {
    return null;
  }

  // sort by units_remaining DESC, then by id ASC
  const sorted = [...cartonsForProduct].sort((a, b) => {
    const ua = Number(a.units_remaining || 0);
    const ub = Number(b.units_remaining || 0);
    if (ub !== ua) return ub - ua;
    return a.id - b.id;
  });

  let totalAvailable = 0;
  sorted.forEach((c) => {
    totalAvailable += Number(c.units_remaining || 0);
  });

  if (totalAvailable < desiredUnits) {
    return null;
  }

  const selectedCartons = [];
  let sum = 0;

  for (const c of sorted) {
    if (sum >= desiredUnits) break;
    const units = Number(c.units_remaining || 0);
    if (units <= 0) continue;
    selectedCartons.push(c);
    sum += units;
  }

  if (sum < desiredUnits) {
    return null;
  }

  return { selectedCartons, totalUnits: sum };
}

/**
 * Expand rows that are in "auto" mode into multiple "carton" items.
 *
 * - User selects a carton + desired quantity in UNITS.
 * - We look at ALL cartons for that product (status="received", units_remaining>0).
 * - We pick the FEWEST cartons whose total units >= desired.
 * - Then we create `mode: "carton"` rows for each carton we select.
 *
 * Example:
 *   Carton units: [50,72,72,72], desired=216
 *   => we pick the three 72s (total 216), NOT all four cartons.
 *
 * Other rows (carton / loose) are passed through unchanged.
 */
function expandAutoItems(rows, cartons, products) {
  const expanded = [];

  rows.forEach((r) => {
    if (r.mode !== "auto") {
      expanded.push(r);
      return;
    }

    if (!r.carton_id) {
      throw new Error("Auto items must have a carton selected.");
    }

    const desired = Number(r.quantity || 0);
    if (!desired || desired <= 0) {
      throw new Error("Auto items must have a valid quantity.");
    }

    const baseCarton = cartons.find(
      (c) => c.id === Number(r.carton_id)
    );
    if (!baseCarton) {
      throw new Error(`Selected carton #${r.carton_id} not found.`);
    }

    const productId = baseCarton.product_id || r.product_id;
    if (!productId) {
      throw new Error(
        `Product not found for selected carton #${baseCarton.id}.`
      );
    }

    const unitPrice =
      r.unit_price != null
        ? Number(r.unit_price)
        : getUnitPriceForProductFromList(products, productId);

    const cartonsForProduct = cartons.filter(
      (c) =>
        c.product_id === productId &&
        c.status === "received" &&
        Number(c.units_remaining || 0) > 0
    );

    const totalAvailable = cartonsForProduct.reduce(
      (sum, c) => sum + Number(c.units_remaining || 0),
      0
    );

    if (totalAvailable < desired) {
      throw new Error(
        `Not enough cartons available for this product. Requested ${desired} units, but only ${totalAvailable} units are available across all cartons.`
      );
    }

    const selection = selectCartonsForAuto(cartonsForProduct, desired);
    if (!selection) {
      throw new Error(
        `Not enough cartons available for this product. Requested ${desired} units, but available stock cannot satisfy it.`
      );
    }

    selection.selectedCartons.forEach((c) => {
      const qty = Number(c.units_remaining || 0);

      expanded.push({
        uid: Date.now() + Math.random(),
        mode: "carton",
        carton_id: c.id,
        product_id: productId,
        quantity: qty, // full carton => unopened
        unit_price: unitPrice,
        line_total: qty * unitPrice,
      });
    });
  });

  return expanded;
}

// 🔥 draw invoice as an image & return dataURL
async function generateInvoiceImage(order, items, products) {
  const width = 900;
  const height = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // border
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  // logo + company name
  const logoSize = 120;
  const logoImg = await loadImage(COMPANY_LOGO_URL);
  const padding = 40;

  if (logoImg) {
    ctx.drawImage(logoImg, padding, padding, logoSize, logoSize);
  }

  ctx.fillStyle = "#111111";
  ctx.textBaseline = "top";
  ctx.font = "bold 32px Arial";
  ctx.fillText(COMPANY_NAME, padding + logoSize + 20, padding + 10);

  ctx.font = "24px Arial";
  ctx.fillText("Invoice", padding + logoSize + 20, padding + 60);

  // order + customer info
  let y = padding + logoSize + 40;

  ctx.font = "18px Arial";
  ctx.fillText(`Invoice ID: #${order.id}`, padding, y);
  y += 24;
  if (order.created_at) {
    const dt = new Date(order.created_at);
    ctx.fillText(`Date: ${dt.toLocaleString()}`, padding, y);
    y += 24;
  }
  ctx.fillText(`Address: Motijheel, Dhaka, Bangladesh`, padding, y);
  y += 24;
  ctx.fillText(`Phone: +8801711276418`, padding, y);
  y += 40;

  ctx.font = "20px Arial";
  ctx.fillText("Bill To:", padding, y);
  y += 24;
  ctx.font = "18px Arial";
  wrapText(ctx, `${order.customer_name || ""}`, padding, y, 400, 20);
  y += 20;
  if (order.customer_email) {
    wrapText(
      ctx,
      `Email: ${order.customer_email}`,
      padding,
      y,
      400,
      20
    );
    y += 20;
  }
  if (order.customer_phone) {
    wrapText(
      ctx,
      `Phone: ${order.customer_phone}`,
      padding,
      y,
      400,
      20
    );
    y += 20;
  }
  if (order.delivery_address) {
    y = wrapText(
      ctx,
      `Address: ${order.delivery_address}`,
      padding,
      y,
      500,
      20
    );
    y += 20;
  }

  // table header (no Cartons column here)
  y += 30;
  const colX = {
    product: padding,
    qty: padding + 420,
    unit: padding + 520,
    total: padding + 660,
  };

  ctx.font = "bold 16px Arial";
  ctx.fillText("Product", colX.product, y);
  ctx.fillText("Qty", colX.qty, y);
  ctx.fillText("Unit Price", colX.unit, y);
  ctx.fillText("Line Total", colX.total, y);
  y += 18;
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(width - padding, y);
  ctx.stroke();
  y += 20;

  ctx.font = "16px Arial";

  // items
  let subtotal = 0;
  (items || []).forEach((item) => {
    const product = products.find((p) => p.id === item.product_id);
    const productName = product?.name || "Unknown Product";

    const text = `${productName}`;
    const lineHeight = 20;

    // Product text only
    y = wrapText(ctx, text, colX.product, y, 380, lineHeight);

    // Qty / prices
    ctx.fillText(String(item.quantity || 0), colX.qty, y);
    ctx.fillText(`৳${(item.unit_price || 0).toFixed(2)}`, colX.unit, y);
    ctx.fillText(`৳${(item.line_total || 0).toFixed(2)}`, colX.total, y);
    y += 24;

    subtotal += item.line_total || 0;
  });

  // totals
  y += 20;
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(width - padding, y);
  ctx.stroke();
  y += 10;

  const deliveryFee = Number(order.delivery_charge || 0);
  const total = Number(order.total || subtotal + deliveryFee);

  ctx.font = "16px Arial";
  ctx.fillText(
    `Subtotal: ৳${(subtotal || 0).toFixed(2)}`,
    colX.total - 40,
    y
  );
  y += 22;
  ctx.fillText(
    `Delivery: ৳${deliveryFee.toFixed(2)}`,
    colX.total - 40,
    y
  );
  y += 22;
  ctx.font = "bold 18px Arial";
  ctx.fillText(`Total: ৳${total.toFixed(2)}`, colX.total - 40, y);
  y += 40;

  ctx.font = "14px Arial";
  ctx.fillText(
    "Thank you for your business!",
    padding,
    height - padding - 30
  );

  return canvas.toDataURL("image/png");
}

// 🔁 helper to upload invoice & update orders.invoice_url
async function createOrUpdateInvoice(orderRow, items, products) {
  const dataUrl = await generateInvoiceImage(orderRow, items, products);
  const fileName = `invoice_${orderRow.id}.png`;
  const file = await dataURLToFile(dataUrl, fileName);

  const { error: uploadError } = await supabase.storage
    .from("invoices")
    .upload(fileName, file, { upsert: true });

  if (uploadError) {
    console.error("Supabase upload error (invoice):", uploadError);
    throw new Error(uploadError.message || "Failed to upload invoice.");
  }

  const { data: publicData } = await supabase.storage
    .from("invoices")
    .getPublicUrl(fileName);

  const baseUrl = publicData?.publicUrl || null;
  const invoiceUrl = baseUrl ? `${baseUrl}?v=${Date.now()}` : null;

  const { data: finalOrder, error: finalUpdateError } = await supabase
    .from("orders")
    .update({ invoice_url: invoiceUrl })
    .eq("id", orderRow.id)
    .select()
    .single();

  if (finalUpdateError) {
    console.error(
      "Supabase final update error (invoice_url):",
      finalUpdateError
    );
    throw new Error(finalUpdateError.message || "Failed to save invoice URL.");
  }

  return finalOrder;
}

/**
 * 🔹 Order items editor (cartons / loose / auto) – kept outside main component
 */
const OrderItemsEditor = ({
  items,
  setItems,
  title,
  cartons,
  getCartonLabel,
  getUnitPriceForProduct,
  isEdit = false,
}) => {
  const addRow = () => {
    if (items.length >= 25) {
      alert("You cannot add more than 25 items in a single order.");
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        uid: Date.now() + Math.random(),
        mode: "carton",
        carton_id: "",
        product_id: null,
        quantity: 0,
        unit_price: 0,
        line_total: 0,
      },
    ]);
  };

  const removeRow = (uid) => {
    setItems((prev) => prev.filter((r) => r.uid !== uid));
  };

  const updateRow = (uid, updater) => {
    setItems((prev) =>
      prev.map((row) =>
        row.uid === uid ? { ...row, ...updater(row) } : row
      )
    );
  };

  const handleModeChange = (uid, newMode) => {
    setItems((prev) => {
      const updated = prev.map((row) =>
        row.uid === uid
          ? {
              ...row,
              mode: newMode,
              carton_id: "",
              product_id: null,
              quantity: 0,
              unit_price: 0,
              line_total: 0,
            }
          : row
      );
      return updated;
    });
  };

  const handleCartonChange = (uid, cartonIdStr) => {
    const cartonId = cartonIdStr ? Number(cartonIdStr) : null;
    const carton = cartons.find((c) => c.id === cartonId);

    updateRow(uid, (row) => {
      if (!carton) {
        return {
          carton_id: "",
          product_id: null,
          quantity: 0,
          unit_price: 0,
          line_total: 0,
        };
      }

      const unitPrice = getUnitPriceForProduct(carton.product_id);
      let qty = 0;

      if (row.mode === "carton") {
        qty = Number(carton.units_remaining || 0);
      } else if (row.mode === "loose") {
        // loose default 1
        qty = 1;
      } else if (row.mode === "auto") {
        // in auto, user will set quantity manually; keep 0 for now
        qty = 0;
      }

      const lineTotal = qty * unitPrice;

      return {
        carton_id: cartonId,
        product_id: carton.product_id,
        quantity: qty,
        unit_price: unitPrice,
        line_total: lineTotal,
      };
    });
  };

  const handleQtyChange = (uid, value) => {
    const qtyNum = Number(value) || 0;

    updateRow(uid, (row) => {
      const mode = row.mode || "carton";

      if (mode === "auto") {
        // For auto, just store requested total qty in units.
        let clamped = qtyNum;
        if (clamped < 1) clamped = 1;

        const unitPrice = Number(row.unit_price || 0);
        const lineTotal = clamped * unitPrice;

        return {
          quantity: clamped,
          line_total: lineTotal,
        };
      }

      if (!row.carton_id) {
        return { quantity: 0, line_total: 0 };
      }

      const carton = cartons.find((c) => c.id === Number(row.carton_id));
      const maxQty = carton ? Number(carton.units_remaining || 0) : 0;
      let clamped = qtyNum;

      if (clamped < 1) clamped = 1;
      if (maxQty > 0 && clamped > maxQty) clamped = maxQty;

      const lineTotal = clamped * Number(row.unit_price || 0);

      return {
        quantity: clamped,
        line_total: lineTotal,
      };
    });
  };

  const handleUnitPriceChange = (uid, value) => {
    const unitPriceNum = Number(value) || 0;

    updateRow(uid, (row) => {
      const qty = Number(row.quantity || 0);
      const lineTotal = qty * unitPriceNum;

      return {
        unit_price: unitPriceNum,
        line_total: lineTotal,
      };
    });
  };

  const availableCartonsFor = (mode) => {
    if (mode === "carton" || mode === "auto") {
      // full / auto cartons: received only
      return cartons.filter((c) => c.status === "received");
    }
    // loose: received + open
    return cartons.filter(
      (c) => c.status === "received" && c.is_open === true
    );
  };

  return (
    <>
      <h5 className="mt-3">{title}</h5>
      <Table bordered size="sm" className="mt-2">
        <thead>
          <tr>
            <th>Type</th>
            <th>Carton</th>
            <th style={{ width: "120px" }}>Quantity</th>
            <th>Unit Price</th>
            <th>Line Total</th>
            <th style={{ width: "60px" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center">
                No items added yet.
              </td>
            </tr>
          ) : (
            items.map((row) => {
              const mode = row.mode || "carton";

              // 1) Base list: only available cartons for this mode
              const baseCartonList = availableCartonsFor(mode);

              // 2) The previously selected carton (even if booked now)
              const selectedCarton =
                row.carton_id != null && row.carton_id !== ""
                  ? cartons.find((c) => c.id === Number(row.carton_id))
                  : null;

              // 3) Ensure selected carton is present so it shows in dropdown
              let cartonList = baseCartonList;
              if (
                selectedCarton &&
                !baseCartonList.some((c) => c.id === selectedCarton.id)
              ) {
                cartonList = [selectedCarton, ...baseCartonList];
              }

              // Use cartonList to compute maxQty for loose
              const currentCarton =
                cartonList.find((c) => c.id === Number(row.carton_id)) ||
                selectedCarton;

              const maxQty =
                currentCarton && mode === "loose"
                  ? Number(currentCarton.units_remaining || 0)
                  : undefined;

              // Max + helper for auto
              let autoMaxQty;
              let autoHelper = "";

              if (mode === "auto") {
                const productId =
                  currentCarton?.product_id || row.product_id;
                if (productId) {
                  const cartonsForProduct = cartons
                    .filter(
                      (c) =>
                        c.product_id === productId &&
                        c.status === "received" &&
                        Number(c.units_remaining || 0) > 0
                    )
                    .sort((a, b) => a.id - b.id);

                  autoMaxQty = cartonsForProduct.reduce(
                    (sum, c) => sum + Number(c.units_remaining || 0),
                    0
                  );

                  const desired = Number(row.quantity || 0);

                  if (desired > 0 && cartonsForProduct.length > 0) {
                    const selection = selectCartonsForAuto(
                      cartonsForProduct,
                      desired
                    );

                    if (selection) {
                      const neededCount =
                        selection.selectedCartons.length;
                      const totalUnits = selection.totalUnits;

                      // Option A-style text (current behavior)
                      autoHelper = `Will use ${neededCount} carton${
                        neededCount > 1 ? "s" : ""
                      } = ${totalUnits} units`;

                      // Option B (with IDs) – commented for future:
                      // const usedIds = selection.selectedCartons
                      //   .map((c) => c.id)
                      //   .join(", ");
                      // autoHelper = `Will use ${neededCount} carton${
                      //   neededCount > 1 ? "s" : ""
                      // } (IDs: ${usedIds}) = ${totalUnits} units`;
                    } else if (autoMaxQty > 0) {
                      autoHelper = `Not enough stock to fully satisfy ${desired} units. Max across cartons: ${autoMaxQty} units.`;
                    }
                  }
                }
              }

              return (
                <tr key={row.uid}>
                  <td>
                    <Form.Control
                      as="select"
                      value={mode}
                      onChange={(e) =>
                        handleModeChange(row.uid, e.target.value)
                      }
                    >
                      <option value="carton">Carton</option>
                      <option value="loose">Loose</option>
                      <option value="auto">Auto</option>
                    </Form.Control>
                  </td>
                  <td>
                    <Form.Control
                      as="select"
                      value={row.carton_id || ""}
                      onChange={(e) =>
                        handleCartonChange(row.uid, e.target.value)
                      }
                    >
                      <option value="">Select carton</option>
                      {cartonList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {getCartonLabel(c)}
                        </option>
                      ))}
                    </Form.Control>
                  </td>
                  <td>
                    {mode === "carton" ? (
                      <Form.Control
                        type="number"
                        value={row.quantity || 0}
                        readOnly
                        disabled
                      />
                    ) : (
                      <>
                        <Form.Control
                          type="number"
                          min={1}
                          {...(!isEdit && mode === "loose" && typeof maxQty === "number"
                            ? { max: maxQty }
                            : {})}
                          value={row.quantity || ""}
                          onChange={(e) =>
                            handleQtyChange(row.uid, e.target.value)
                          }
                        />
                        {!isEdit &&
                          mode === "loose" &&
                          typeof maxQty === "number" && (
                            <small className="text-muted d-block">
                              Max: {maxQty}
                            </small>
                          )}
                        {mode === "auto" && autoHelper && (
                          <small className="text-muted d-block">
                            {autoHelper}
                          </small>
                        )}
                        {mode === "auto" &&
                          typeof autoMaxQty === "number" &&
                          autoMaxQty > 0 && (
                            <small className="text-muted d-block">
                              Max across cartons: {autoMaxQty}
                            </small>
                          )}
                      </>
                    )}
                  </td>
                  <td>
                    <Form.Control
                      type="number"
                      step="0.01"
                      min={0}
                      value={
                        row.unit_price !== undefined &&
                        row.unit_price !== null
                          ? row.unit_price
                          : ""
                      }
                      onChange={(e) =>
                        handleUnitPriceChange(row.uid, e.target.value)
                      }
                    />
                  </td>
                  <td>{Number(row.line_total || 0).toFixed(2)}</td>
                  <td>
                    <Button
                      variant="link"
                      size="sm"
                      className="text-danger p-0"
                      onClick={() => removeRow(row.uid)}
                    >
                      <i className="fa fa-trash" />
                    </Button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
      <Button variant="secondary" size="sm" onClick={addRow}>
        + Add Item
      </Button>
    </>
  );
};

// -----------------------------------

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [cartons, setCartons] = useState([]);
  const [products, setProducts] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    deliveryFee: "0",
    status: "Created",
  });

  // create-order items (per-item carton/loose/auto)
  const [items, setItems] = useState([
    {
      uid: Date.now(),
      mode: "carton", // "carton" | "loose" | "auto"
      carton_id: "",
      product_id: null,
      quantity: 0,
      unit_price: 0,
      line_total: 0,
    },
  ]);

  // EDIT modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editCustomer, setEditCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    deliveryFee: "0",
    status: "Created",
  });
  const [editItems, setEditItems] = useState([]);
  const [originalEditItems, setOriginalEditItems] = useState([]);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // invoice zoom
  const [selectedInvoiceImage, setSelectedInvoiceImage] = useState(null);

  useEffect(() => {
    async function fetchAll() {
      const [
        { data: ordersData, error: ordersErr },
        { data: cartonsData, error: cartonsErr },
        { data: productsData, error: productsErr },
      ] = await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .order("id", { ascending: false }),
        supabase.from("cartons").select("*"),
        supabase.from("products").select("*"),
      ]);

      if (ordersErr) console.error("Supabase error (orders):", ordersErr);
      if (cartonsErr) console.error("Supabase error (cartons):", cartonsErr);
      if (productsErr) console.error("Supabase error (products):", productsErr);

      setOrders(ordersData || []);
      setCartons(cartonsData || []);
      setProducts(productsData || []);
    }

    fetchAll();
  }, []);

  const getProductName = (id) => {
    const p = products.find((x) => x.id === id);
    return p ? p.name : "Unknown Product";
  };

  const getCartonLabel = (carton) => {
    if (!carton) return "Unknown Carton";
    return `Carton ${carton.id} - ${getProductName(carton.product_id)}`;
  };

  const getUnitPriceForProduct = (productId) =>
    getUnitPriceForProductFromList(products, productId);

  // 🔹 NEW: helper to show carton IDs in orders list
  const getOrderCartonList = (order) => {
    const itemsFromDb = Array.isArray(order.items) ? order.items : [];
    const ids = [
      ...new Set(
        itemsFromDb
          .filter((it) => it.carton_id)
          .map((it) => Number(it.carton_id))
      ),
    ];
    return ids.length ? ids.join(", ") : "";
  };

  // ---------- shared totals helpers ----------

  const calcSubtotal = (rows) =>
    rows.reduce((sum, r) => sum + Number(r.line_total || 0), 0);

  // ---------- carton booking helper (NEW) ----------

  const applyCartonStatusChanges = async ({ bookIds = [], unbookIds = [] }) => {
    // avoid unnecessary DB calls
    const uniqueBookIds = [...new Set(bookIds)].filter(Boolean);
    const uniqueUnbookIds = [...new Set(unbookIds)].filter(Boolean);

    if (uniqueBookIds.length === 0 && uniqueUnbookIds.length === 0) {
      return;
    }

    const updatedCartons = [...cartons];

    // set status = "booked" for bookIds
    if (uniqueBookIds.length > 0) {
      const { data, error } = await supabase
        .from("cartons")
        .update({ status: "booked" })
        .in("id", uniqueBookIds)
        .select();

      if (error) {
        console.error("Supabase error booking cartons:", error);
        throw new Error(error.message || "Failed to book cartons.");
      }

      (data || []).forEach((c) => {
        const idx = updatedCartons.findIndex((x) => x.id === c.id);
        if (idx !== -1) updatedCartons[idx] = c;
      });
    }

    // set status = "received" for unbookIds
    if (uniqueUnbookIds.length > 0) {
      const { data, error } = await supabase
        .from("cartons")
        .update({ status: "received" })
        .in("id", uniqueUnbookIds)
        .select();

      if (error) {
        console.error("Supabase error unbooking cartons:", error);
        throw new Error(error.message || "Failed to unbook cartons.");
      }

      (data || []).forEach((c) => {
        const idx = updatedCartons.findIndex((x) => x.id === c.id);
        if (idx !== -1) updatedCartons[idx] = c;
      });
    }

    setCartons(updatedCartons);
  };

  // ---------- CREATE ORDER ----------

  const handleCustomerChange = (e) => {
    const { name, value } = e.target;
    setCustomer((prev) => ({ ...prev, [name]: value }));
  };

  const validateItems = (rows, isEdit = false) => {
    if (rows.length === 0) {
      return "Please add at least one item.";
    }
    if (rows.length > 25) {
      return "You cannot add more than 25 items in a single order.";
    }

    for (const r of rows) {
      if (!r.carton_id)
        return "Each item must have a carton selected.";

      // ❌ REMOVE quantity requirement on edit
      if (!isEdit) {
        if (
          (r.mode === "loose" || r.mode === "auto") &&
          (!r.quantity || r.quantity <= 0)
        ) {
          return "Loose/Auto items must have a valid quantity.";
        }
      }
    }

    return null;
  };


  const applyLooseAdjustments = async (adjustments) => {
    // adjustments: { [cartonId]: deltaUnits }
    const ids = Object.keys(adjustments);
    if (ids.length === 0) return;

    const updatedCartons = [...cartons];

    for (const idStr of ids) {
      const id = Number(idStr);
      const delta = adjustments[idStr]; // can be negative or positive
      const index = updatedCartons.findIndex((c) => c.id === id);
      if (index === -1) continue;
      const currentUnits = Number(updatedCartons[index].units_remaining || 0);
      const newUnits = currentUnits + delta; // delta negative => subtract

      // prevent below zero
      if (newUnits < 0) {
        throw new Error(`Not enough units remaining for Carton ${id}.`);
      }

      const { data: updated, error } = await supabase
        .from("cartons")
        .update({ units_remaining: newUnits })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Supabase error updating carton units:", error);
        throw new Error(error.message || "Failed to update carton units.");
      }

      updatedCartons[index] = updated;
    }

    setCartons(updatedCartons);
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    setCreateError("");

    if (!customer.name?.trim()) {
      setCreateError("Customer name is required.");
      return;
    }

    if (!customer.phone?.trim()) {
      setCreateError("Customer phone is required.");
      return;
    }

    if (!customer.address?.trim()) {
      setCreateError("Delivery address is required.");
      return;
    }

    const itemErr = validateItems(items, false);
    if (itemErr) {
      setCreateError(itemErr);
      return;
    }

    try {
      setCreating(true);

      // expand "auto" items into multiple "carton" rows
      const expandedItems = expandAutoItems(items, cartons, products);

      if (expandedItems.length > 25) {
        throw new Error(
          "You cannot have more than 25 items in a single order."
        );
      }

      const subtotal = calcSubtotal(expandedItems);
      const deliveryFee = Number(customer.deliveryFee || 0);
      const total_amount = subtotal + deliveryFee;

      const orderItemsPayload = expandedItems.map((r) => ({
        mode: r.mode,
        carton_id: r.carton_id ? Number(r.carton_id) : null,
        product_id: r.product_id || null,
        quantity: Number(r.quantity || 0),
        unit_price: Number(r.unit_price || 0),
        line_total: Number(r.line_total || 0),
      }));

      const insertPayload = {
        customer_name: customer.name,
        customer_email: customer.email || null,
        customer_phone: customer.phone || null,
        delivery_address: customer.address || null,
        status: customer.status || "Created",
        items: orderItemsPayload,
        subtotal,
        delivery_charge: deliveryFee,
        total_amount: total_amount,
      };

      const { data: insertedOrder, error: insertErr } = await supabase
        .from("orders")
        .insert([insertPayload])
        .select()
        .single();

      if (insertErr) {
        console.error("Supabase insert error (order):", insertErr);
        setCreateError(insertErr.message || "Failed to create order.");
        return;
      }

      // inventory adjustments for loose items (auto expanded cartons remain cartons)
      const looseAdjustments = {};
      orderItemsPayload.forEach((it) => {
        if (it.mode === "loose" && it.carton_id) {
          const key = String(it.carton_id);
          looseAdjustments[key] =
            (looseAdjustments[key] || 0) - it.quantity;
        }
      });

      if (Object.keys(looseAdjustments).length > 0) {
        await applyLooseAdjustments(looseAdjustments);
      }

      // 🔹 NEW: mark full cartons in this order as "booked"
      const cartonBookIds = orderItemsPayload
        .filter((it) => it.mode === "carton" && it.carton_id)
        .map((it) => it.carton_id);

      if (cartonBookIds.length > 0) {
        await applyCartonStatusChanges({ bookIds: cartonBookIds });
      }

      // generate invoice
      const finalOrder = await createOrUpdateInvoice(
        insertedOrder,
        orderItemsPayload,
        products
      );

      // prepend in local list
      setOrders((prev) => [finalOrder, ...prev]);

      // reset form
      setCustomer({
        name: "",
        email: "",
        phone: "",
        address: "",
        deliveryFee: "0",
        status: "Created",
      });
      setItems([
        {
          uid: Date.now(),
          mode: "carton",
          carton_id: "",
          product_id: null,
          quantity: 0,
          unit_price: 0,
          line_total: 0,
        },
      ]);
    } catch (err) {
      console.error("Unexpected error creating order:", err);
      setCreateError(err?.message || "Unexpected error while creating order.");
    } finally {
      setCreating(false);
    }
  };

  // ---------- EDIT ORDER ----------

  const openEditModal = (order) => {
    setEditingOrder(order);
    setEditError("");

    const itemsFromDb = Array.isArray(order.items) ? order.items : [];

    setEditCustomer({
      name: order.customer_name || "",
      email: order.customer_email || "",
      phone: order.customer_phone || "",
      address: order.delivery_address || "",
      deliveryFee: String(order.delivery_charge || 0),
      status: order.status || "Created",
    });

    const mappedItems = itemsFromDb.map((it) => ({
      uid: Date.now() + Math.random(),
      mode: it.mode || "carton",
      carton_id: it.carton_id || "",
      product_id: it.product_id || null,
      quantity: it.quantity || 0,
      unit_price: it.unit_price || 0,
      line_total: it.line_total || 0,
    }));

    setEditItems(mappedItems);
    setOriginalEditItems(itemsFromDb);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingOrder(null);
  };

  const handleEditCustomerChange = (e) => {
    const { name, value } = e.target;
    setEditCustomer((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdateOrder = async (e) => {
    e.preventDefault();
    if (!editingOrder) return;
    setEditError("");

    if (!editCustomer.name?.trim()) {
      setEditError("Customer name is required.");
      return;
    }

    if (!editCustomer.phone?.trim()) {
      setEditError("Customer phone is required.");
      return;
    }

    if (!editCustomer.address?.trim()) {
      setEditError("Delivery address is required.");
      return;
    }

    const itemErr = validateItems(editItems, true);
    if (itemErr) {
      setEditError(itemErr);
      return;
    }

    try {
      setSavingEdit(true);

      // expand "auto" items into multiple "carton" rows
      const expandedItems = expandAutoItems(editItems, cartons, products);

      if (expandedItems.length > 25) {
        throw new Error(
          "You cannot have more than 25 items in a single order."
        );
      }

      const subtotal = calcSubtotal(expandedItems);
      const deliveryFee = Number(editCustomer.deliveryFee || 0);
      const total_amount = subtotal + deliveryFee;

      const newItemsPayload = expandedItems.map((r) => ({
        mode: r.mode,
        carton_id: r.carton_id ? Number(r.carton_id) : null,
        product_id: r.product_id || null,
        quantity: Number(r.quantity || 0),
        unit_price: Number(r.unit_price || 0),
        line_total: Number(r.line_total || 0),
      }));

      const payload = {
        customer_name: editCustomer.name,
        customer_email: editCustomer.email || null,
        customer_phone: editCustomer.phone || null,
        delivery_address: editCustomer.address || null,
        status: editCustomer.status || "Created",
        items: newItemsPayload,
        subtotal,
        delivery_charge: deliveryFee,
        total_amount: total_amount,
        updated_at: new Date().toISOString(),
      };

      // build adjustments for loose items: old -> +quantity, new -> -quantity
      const looseAdjustments = {};

      (originalEditItems || []).forEach((it) => {
        if (it.mode === "loose" && it.carton_id) {
          const key = String(it.carton_id);
          looseAdjustments[key] =
            (looseAdjustments[key] || 0) + Number(it.quantity || 0);
        }
      });

      newItemsPayload.forEach((it) => {
        if (it.mode === "loose" && it.carton_id) {
          const key = String(it.carton_id);
          looseAdjustments[key] =
            (looseAdjustments[key] || 0) - Number(it.quantity || 0);
        }
      });

      const { data: updatedOrder, error: updateErr } = await supabase
        .from("orders")
        .update(payload)
        .eq("id", editingOrder.id)
        .select()
        .single();

      if (updateErr) {
        console.error("Supabase update error (order):", updateErr);
        setEditError(updateErr.message || "Failed to update order.");
        return;
      }

      if (Object.keys(looseAdjustments).length > 0) {
        await applyLooseAdjustments(looseAdjustments);
      }

      // 🔹 NEW: carton booking changes for edit
      const prevCartonIds = new Set(
        (originalEditItems || [])
          .filter((it) => it.mode === "carton" && it.carton_id)
          .map((it) => it.carton_id)
      );

      const newCartonIds = new Set(
        newItemsPayload
          .filter((it) => it.mode === "carton" && it.carton_id)
          .map((it) => it.carton_id)
      );

      const cartonsToBook = [];
      const cartonsToUnbook = [];

      // new cartons: in new but not in prev
      newCartonIds.forEach((id) => {
        if (!prevCartonIds.has(id)) {
          cartonsToBook.push(id);
        }
      });

      // removed cartons: in prev but not in new
      prevCartonIds.forEach((id) => {
        if (!newCartonIds.has(id)) {
          cartonsToUnbook.push(id);
        }
      });

      if (cartonsToBook.length > 0 || cartonsToUnbook.length > 0) {
        await applyCartonStatusChanges({
          bookIds: cartonsToBook,
          unbookIds: cartonsToUnbook,
        });
      }

      // regenerate invoice
      const finalOrder = await createOrUpdateInvoice(
        updatedOrder,
        newItemsPayload,
        products
      );

      setOrders((prev) =>
        prev.map((o) => (o.id === finalOrder.id ? finalOrder : o))
      );
      closeEditModal();
    } catch (err) {
      console.error("Unexpected edit error:", err);
      setEditError(err?.message || "Unexpected error updating order.");
    } finally {
      setSavingEdit(false);
    }
  };

  // ---------- DELETE ORDER ----------

  const handleDeleteOrder = async (order) => {
    const confirmed = window.confirm(
      `Delete Order #${order.id}? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      // add back loose items to cartons
      const itemsFromDb = Array.isArray(order.items) ? order.items : [];
      const looseAdjustments = {};
      itemsFromDb.forEach((it) => {
        if (it.mode === "loose" && it.carton_id) {
          const key = String(it.carton_id);
          looseAdjustments[key] =
            (looseAdjustments[key] || 0) + Number(it.quantity || 0);
        }
      });

      if (Object.keys(looseAdjustments).length > 0) {
        await applyLooseAdjustments(looseAdjustments);
      }

      // 🔹 NEW: unbook full cartons in this order
      const cartonsToUnbook = itemsFromDb
        .filter((it) => it.mode === "carton" && it.carton_id)
        .map((it) => it.carton_id);

      if (cartonsToUnbook.length > 0) {
        await applyCartonStatusChanges({ unbookIds: cartonsToUnbook });
      }

      // delete invoice file (best-effort)
      if (order.invoice_url) {
        try {
          const fileName = `invoice_${order.id}.png`;
          await supabase.storage.from("invoices").remove([fileName]);
        } catch (e) {
          console.warn("Failed to remove invoice file (ignored):", e);
        }
      }

      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("id", order.id);

      if (error) {
        console.error("Supabase delete error (order):", error);
        alert(error.message || "Failed to delete order.");
        return;
      }

      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (err) {
      console.error("Unexpected delete error:", err);
      alert(err?.message || "Unexpected error while deleting order.");
    }
  };

  // ---------- INVOICE GENERATION / PRINT ----------

  const handleGenerateInvoice = async (order) => {
    try {
      const itemsFromDb = Array.isArray(order.items) ? order.items : [];
      const finalOrder = await createOrUpdateInvoice(
        order,
        itemsFromDb,
        products
      );

      setOrders((prev) =>
        prev.map((o) => (o.id === finalOrder.id ? finalOrder : o))
      );
    } catch (err) {
      console.error("Invoice generation error:", err);
      alert(err?.message || "Failed to generate invoice.");
    }
  };

  const handlePrintInvoice = (order) => {
    if (!order.invoice_url) return;
    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) return;

    printWindow.document.open();
    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice #${order.id}</title>
          <style>
            body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
            img { max-width: 100%; height: auto; }
          </style>
        </head>
        <body>
          <img src="${order.invoice_url}" alt="Invoice #${order.id}" />
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() {
                window.close();
              };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ---------- subtotal & total for create/edit forms ----------

  const createSubtotal = calcSubtotal(items);
  const createDeliveryFeeNum = Number(customer.deliveryFee || 0);
  const createTotal = createSubtotal + createDeliveryFeeNum;

  const editSubtotal = calcSubtotal(editItems);
  const editDeliveryFeeNum = Number(editCustomer.deliveryFee || 0);
  const editTotal = editSubtotal + editDeliveryFeeNum;

  return (
    <Container fluid>
      <Row>
        <Col md="12">
          <Card className="strpied-tabled-with-hover">
            <Card.Header>
              <Card.Title as="h4">Orders</Card.Title>
              <p className="card-category">
                Create and manage customer orders & invoices
              </p>

              <div className="d-flex justify-content-start mb-2 mt-3">
                <Button
                  variant={showForm ? "danger" : "info"}
                  onClick={() => setShowForm((prev) => !prev)}
                >
                  {showForm ? "Close" : "Create New Order"}
                </Button>
              </div>

              <Collapse in={showForm}>
                <div>
                  <Form onSubmit={handleCreateOrder} className="border-top pt-3">
                    <Row>
                      <Col md={4} className="mb-2">
                        <Form.Label>Customer Name *</Form.Label>
                        <Form.Control
                          type="text"
                          name="name"
                          value={customer.name}
                          onChange={handleCustomerChange}
                        />
                      </Col>
                      <Col md={4} className="mb-2">
                        <Form.Label>Email</Form.Label>
                        <Form.Control
                          type="email"
                          name="email"
                          value={customer.email}
                          onChange={handleCustomerChange}
                        />
                      </Col>
                      <Col md={4} className="mb-2">
                        <Form.Label>Phone *</Form.Label>
                        <Form.Control
                          type="text"
                          name="phone"
                          value={customer.phone}
                          onChange={handleCustomerChange}
                        />
                      </Col>
                    </Row>

                    <Row>
                      <Col md={8} className="mb-2">
                        <Form.Label>Delivery Address *</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={2}
                          name="address"
                          value={customer.address}
                          onChange={handleCustomerChange}
                        />
                      </Col>
                      <Col md={2} className="mb-2">
                        <Form.Label>Delivery Charge</Form.Label>
                        <Form.Control
                          type="number"
                          name="deliveryFee"
                          value={customer.deliveryFee}
                          onChange={handleCustomerChange}
                        />
                      </Col>
                      <Col md={2} className="mb-2">
                        <Form.Label>Status</Form.Label>
                        <Form.Control
                          as="select"
                          name="status"
                          value={customer.status}
                          onChange={handleCustomerChange}
                        >
                          <option value="Created">Created</option>
                          <option value="Shipped">Shipped</option>
                          <option value="Delivered">Delivered</option>
                          <option value="Paid">Paid</option>
                        </Form.Control>
                      </Col>
                    </Row>

                    {/* ITEMS EDITOR - CREATE */}
                    <OrderItemsEditor
                      items={items}
                      setItems={setItems}
                      title="Order Items"
                      cartons={cartons}
                      getCartonLabel={getCartonLabel}
                      getUnitPriceForProduct={getUnitPriceForProduct}
                    />

                    <Row className="mt-3">
                      <Col md={4}>
                        <div>
                          <strong>Subtotal:</strong>{" "}
                          {createSubtotal.toFixed(2)}
                        </div>
                        <div>
                          <strong>Delivery:</strong>{" "}
                          {createDeliveryFeeNum.toFixed(2)}
                        </div>
                        <div>
                          <strong>Total:</strong> {createTotal.toFixed(2)}
                        </div>
                      </Col>
                      <Col
                        md={{ span: 4, offset: 4 }}
                        className="d-flex justify-content-end align-items-end"
                      >
                        <div className="text-right w-100">
                          {createError && (
                            <div className="text-danger mb-1">
                              {createError}
                            </div>
                          )}
                          <Button
                            type="submit"
                            variant="info"
                            className="btn-fill"
                            disabled={creating}
                          >
                            {creating ? "Creating..." : "Create Order"}
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
                    <th className="border-0">Customer</th>
                    <th className="border-0">Contact</th>
                    <th className="border-0">Status</th>
                    <th className="border-0">Cartons</th>
                    <th className="border-0">Total</th>
                    <th className="border-0">Invoice</th>
                    <th className="border-0">Created At</th>
                    <th className="border-0">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length > 0 ? (
                    orders.map((order) => {
                      const cartonList = getOrderCartonList(order);
                      return (
                        <tr key={order.id}>
                          <td>#{order.id}</td>
                          <td>
                            <div>{order.customer_name}</div>
                            <small className="text-muted">
                              {order.delivery_address}
                            </small>
                          </td>
                          <td>
                            <div>{order.customer_phone}</div>
                            <small className="text-muted">
                              {order.customer_email}
                            </small>
                          </td>
                          <td>{order.status}</td>
                          <td>{cartonList || "-"}</td>
                          <td>
                            ৳{Number(order.total_amount || 0).toFixed(2)}
                          </td>
                          <td>
                            {order.invoice_url ? (
                              <div style={{ textAlign: "center" }}>
                                <div
                                  onClick={() =>
                                    setSelectedInvoiceImage(order.invoice_url)
                                  }
                                  style={{
                                    width: "140px",
                                    height: "140px",
                                    borderRadius: "12px",
                                    overflow: "hidden",
                                    boxShadow:
                                      "0 4px 12px rgba(0,0,0,0.1)",
                                    background: "#fff",
                                    cursor: "zoom-in",
                                    margin: "0 auto 6px",
                                  }}
                                >
                                  <img
                                    src={order.invoice_url}
                                    alt={`Invoice #${order.id}`}
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                    }}
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline-secondary"
                                  onClick={() => handlePrintInvoice(order)}
                                >
                                  Print Invoice
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleGenerateInvoice(order)}
                              >
                                Get Invoice
                              </Button>
                            )}
                          </td>
                          <td>
                            {order.created_at
                              ? formatDate(order.created_at)
                              : "-"}
                          </td>
                          <td className="align-middle">
                            <div className="d-flex align-items-center gap-2">
                              <Button
                                variant="link"
                                size="sm"
                                className="p-0 text-warning"
                                onClick={() => openEditModal(order)}
                              >
                                <i className="fa fa-edit" />
                              </Button>
                              <Button
                                variant="link"
                                size="sm"
                                className="p-0 text-danger ml-2"
                                onClick={() => handleDeleteOrder(order)}
                              >
                                <i className="fa fa-trash" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="text-center text-danger py-3">
                        No orders have been created yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* EDIT ORDER MODAL (custom overlay) */}
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
            style={{ maxWidth: "800px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <Form onSubmit={handleUpdateOrder}>
                <div className="modal-header">
                  <h5 className="modal-title">
                    Edit Order #{editingOrder?.id}
                  </h5>
                  <button
                    type="button"
                    className="close"
                    onClick={closeEditModal}
                  >
                    <span>&times;</span>
                  </button>
                </div>

                <div
                  className="modal-body"
                  style={{ maxHeight: "70vh", overflowY: "auto" }}
                >
                  <Row>
                    <Col md={4} className="mb-2">
                      <Form.Label>Customer Name *</Form.Label>
                      <Form.Control
                        type="text"
                        name="name"
                        value={editCustomer.name}
                        onChange={handleEditCustomerChange}
                      />
                    </Col>
                    <Col md={4} className="mb-2">
                      <Form.Label>Email</Form.Label>
                      <Form.Control
                        type="email"
                        name="email"
                        value={editCustomer.email}
                        onChange={handleEditCustomerChange}
                      />
                    </Col>
                    <Col md={4} className="mb-2">
                      <Form.Label>Phone *</Form.Label>
                      <Form.Control
                        type="text"
                        name="phone"
                        value={editCustomer.phone}
                        onChange={handleEditCustomerChange}
                      />
                    </Col>
                  </Row>

                  <Row>
                    <Col md={8} className="mb-2">
                      <Form.Label>Delivery Address *</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={2}
                        name="address"
                        value={editCustomer.address}
                        onChange={handleEditCustomerChange}
                      />
                    </Col>
                    <Col md={2} className="mb-2">
                      <Form.Label>Delivery Charge</Form.Label>
                      <Form.Control
                        type="number"
                        name="deliveryFee"
                        value={editCustomer.deliveryFee}
                        onChange={handleEditCustomerChange}
                      />
                    </Col>
                    <Col md={2} className="mb-2">
                      <Form.Label>Status</Form.Label>
                      <Form.Control
                        as="select"
                        name="status"
                        value={editCustomer.status}
                        onChange={handleEditCustomerChange}
                      >
                        <option value="Created">Created</option>
                        <option value="Shipped">Shipped</option>
                        <option value="Delivered">Delivered</option>
                        <option value="Paid">Paid</option>
                      </Form.Control>
                    </Col>
                  </Row>

                  {/* ITEMS EDITOR - EDIT */}
                  <OrderItemsEditor
                    items={editItems}
                    setItems={setEditItems}
                    title="Order Items"
                    cartons={cartons}
                    getCartonLabel={getCartonLabel}
                    getUnitPriceForProduct={getUnitPriceForProduct}
                    isEdit={true} 
                  />

                  <Row className="mt-3">
                    <Col md={4}>
                      <div>
                        <strong>Subtotal:</strong>{" "}
                        {editSubtotal.toFixed(2)}
                      </div>
                      <div>
                        <strong>Delivery:</strong>{" "}
                        {editDeliveryFeeNum.toFixed(2)}
                      </div>
                      <div>
                        <strong>Total:</strong> {editTotal.toFixed(2)}
                      </div>
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

      {/* INVOICE zoom modal */}
      {selectedInvoiceImage && (
        <div
          onClick={() => setSelectedInvoiceImage(null)}
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
            src={selectedInvoiceImage}
            alt="Invoice Zoomed"
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

export default Orders;

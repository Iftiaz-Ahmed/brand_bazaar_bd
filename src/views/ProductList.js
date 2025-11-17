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

const ProductList = () => {
  const [products, setProducts] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [search, setSearch] = useState("");

  // Add product state
  const [newProduct, setNewProduct] = useState({
    name: "",
    brand: "",
    sku: "",
    units_per_carton: "",
    unit_purchase_price: "",
    unit_selling_price: "",
    category: "",
    size: "",
  });
  const [imageFile, setImageFile] = useState(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Edit product state (custom modal)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    brand: "",
    sku: "",
    units_per_carton: "",
    unit_purchase_price: "",
    unit_selling_price: "",
    category: "",
    size: "",
  });
  const [editImageFile, setEditImageFile] = useState(null);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    async function fetchProducts() {
      const { data, error } = await supabase.from("products").select("*");

      if (error) {
        console.error("Supabase error:", error);
      } else {
        setProducts(data.reverse()); // latest first
      }
    }

    fetchProducts();
  }, []);

  // 🔎 Search filter
  const filteredProducts = products.filter((p) => {
    const term = search.toLowerCase();
    return (
      p.name?.toLowerCase().includes(term) ||
      p.brand?.toLowerCase().includes(term) ||
      p.sku?.toLowerCase().includes(term) ||
      p.category?.toLowerCase().includes(term) ||
      p.size?.toLowerCase().includes(term)
    );
  });

  const handleNewProductChange = (e) => {
    const { name, value } = e.target;
    setNewProduct((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Helper: extract storage path from public URL
  const getStoragePathFromUrl = (url) => {
    if (!url) return null;
    const marker = "/product_images/";
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.substring(idx + marker.length); // e.g. "products/filename.jpg"
  };

  // ➕ ADD PRODUCT
  const handleAddProduct = async (e) => {
    e.preventDefault();
    setAddError("");

    if (!newProduct.name || !newProduct.sku) {
      setAddError("Name and SKU are required.");
      return;
    }

    if (!imageFile) {
      setAddError("Please select a product image.");
      return;
    }

    try {
      setAdding(true);

      // 1) Upload image
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.${fileExt}`;
      const filePath = fileName;

      const { error: uploadError } = await supabase.storage
        .from("product_images")
        .upload(filePath, imageFile);

      if (uploadError) {
        console.error("Supabase upload error:", uploadError);
        setAddError(uploadError.message || "Failed to upload image.");
        return;
      }

      // 2) Get public URL
      const { data: publicUrlData } = supabase.storage
        .from("product_images")
        .getPublicUrl(filePath);

      const imageUrl = publicUrlData?.publicUrl || null;

      // 3) Insert product
      const payload = {
        name: newProduct.name,
        brand: newProduct.brand || "",
        sku: newProduct.sku,
        units_per_carton: newProduct.units_per_carton
          ? Number(newProduct.units_per_carton)
          : null,
        unit_purchase_price: newProduct.unit_purchase_price
          ? Number(newProduct.unit_purchase_price)
          : null,
        unit_selling_price: newProduct.unit_selling_price
          ? Number(newProduct.unit_selling_price)
          : null,
        category: newProduct.category || "",
        size: newProduct.size || "",
        image_url: imageUrl,
        updated_at: new Date().toISOString()
      };

      const { data, error: insertError } = await supabase
        .from("products")
        .insert([payload])
        .select()
        .single();

      if (insertError) {
        console.error("Supabase insert error:", insertError);
        setAddError(insertError.message || "Failed to add product.");
      } else {
        setProducts((prev) => [data, ...prev]);
        setNewProduct({
          name: "",
          brand: "",
          sku: "",
          units_per_carton: "",
          unit_purchase_price: "",
          unit_selling_price: "",
          category: "",
          size: "",
        });
        setImageFile(null);
      }
    } finally {
      setAdding(false);
    }
  };

  // 🗑 DELETE PRODUCT (DB only; storage delete optional)
  const handleDeleteProduct = async (product) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this product?"
    );
    if (!confirmed) return;

    const { error } = await supabase.from("products").delete().eq("id", product.id);

    if (error) {
      console.error("Supabase delete error:", error);
      alert(error.message || "Failed to delete product.");
    } else {
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      // If you also want to delete image from storage, uncomment this:
      const oldPath = getStoragePathFromUrl(product.image_url);
      if (oldPath) {
        await supabase.storage.from("product_images").remove([oldPath]);
      }
    }
  };

  // ✏️ OPEN EDIT MODAL
  const openEditModal = (product) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name || "",
      brand: product.brand || "",
      sku: product.sku || "",
      units_per_carton: product.units_per_carton ?? "",
      unit_purchase_price: product.unit_purchase_price ?? "",
      unit_selling_price: product.unit_selling_price ?? "",
      category: product.category || "",
      size: product.size || "",
    });
    setEditImageFile(null);
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

  // 💾 SAVE EDITED PRODUCT
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingProduct) return;

    setEditError("");

    if (!editForm.name || !editForm.sku) {
      setEditError("Name and SKU are required.");
      return;
    }

    try {
      setSavingEdit(true);

      let updatedImageUrl = editingProduct.image_url;

      // If user selected a new image, delete old & upload new
      if (editImageFile) {
        // 1) delete old from storage (best effort)
        const oldPath = getStoragePathFromUrl(editingProduct.image_url);
        if (oldPath) {
          const { error: removeError } = await supabase.storage
            .from("product_images")
            .remove([oldPath]);
          if (removeError) {
            console.error("Supabase remove old image error:", removeError);
          }
        }

        // 2) upload new image
        const fileExt = editImageFile.name.split(".").pop();
        const fileName = `${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}.${fileExt}`;
        const filePath = fileName;

        const { error: uploadError } = await supabase.storage
          .from("product_images")
          .upload(filePath, editImageFile);

        if (uploadError) {
          console.error("Supabase upload new image error:", uploadError);
          setEditError(uploadError.message || "Failed to upload new image.");
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from("product_images")
          .getPublicUrl(filePath);

        updatedImageUrl = publicUrlData?.publicUrl || updatedImageUrl;
      }

      const updatePayload = {
        name: editForm.name,
        brand: editForm.brand || "",
        sku: editForm.sku,
        units_per_carton: editForm.units_per_carton
          ? Number(editForm.units_per_carton)
          : null,
        unit_purchase_price: editForm.unit_purchase_price
          ? Number(editForm.unit_purchase_price)
          : null,
        unit_selling_price: editForm.unit_selling_price
          ? Number(editForm.unit_selling_price)
          : null,
        category: editForm.category || "",
        size: editForm.size || "",
        image_url: updatedImageUrl,
        updated_at: new Date().toISOString()
      };

      const { data, error: updateError } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", editingProduct.id)
        .select()
        .single();

      if (updateError) {
        console.error("Supabase update error:", updateError);
        setEditError(updateError.message || "Failed to update product.");
      } else {
        setProducts((prev) =>
          prev.map((p) => (p.id === editingProduct.id ? data : p))
        );
        setShowEditModal(false);
        setEditingProduct(null);
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
                <Card.Title as="h4">All Products</Card.Title>
                <p className="card-category">
                  Complete details of each product
                </p>

                {/* 🔍 Search bar */}
                <Form.Control
                  type="text"
                  placeholder="Search by name, brand, SKU, category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mt-3 mb-3"
                />

                {/* Toggle Add Product form */}
                <div className="d-flex justify-content-start mb-2">
                  <Button
                    variant={showForm ? "danger" : "info"}
                    onClick={() => setShowForm((prev) => !prev)}
                  >
                    {showForm ? "Close" : "Add New Product"}
                  </Button>
                </div>

                {/* ➕ Add Product mini-form (sliding) */}
                <Collapse in={showForm}>
                  <div>
                    <Form onSubmit={handleAddProduct} className="border-top pt-3">
                      <Row className="align-items-end">
                        <Col md={3} className="mb-2">
                          <Form.Label>Name *</Form.Label>
                          <Form.Control
                            name="name"
                            value={newProduct.name}
                            onChange={handleNewProductChange}
                            placeholder="Product name"
                          />
                        </Col>
                        <Col md={2} className="mb-2">
                          <Form.Label>Brand</Form.Label>
                          <Form.Control
                            name="brand"
                            value={newProduct.brand}
                            onChange={handleNewProductChange}
                            placeholder="Brand"
                          />
                        </Col>
                        <Col md={2} className="mb-2">
                          <Form.Label>SKU *</Form.Label>
                          <Form.Control
                            name="sku"
                            value={newProduct.sku}
                            onChange={handleNewProductChange}
                            placeholder="SKU"
                          />
                        </Col>
                        <Col md={2} className="mb-2">
                          <Form.Label>Units/Carton</Form.Label>
                          <Form.Control
                            name="units_per_carton"
                            type="number"
                            value={newProduct.units_per_carton}
                            onChange={handleNewProductChange}
                            placeholder="e.g. 72"
                          />
                        </Col>
                        <Col md={3} className="mb-2">
                          <Form.Label>Image *</Form.Label>
                          <Form.Control
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              setImageFile(e.target.files?.[0] || null)
                            }
                          />
                        </Col>
                      </Row>

                      <Row className="align-items-end mt-2">
                        <Col md={2} className="mb-2">
                          <Form.Label>Buying Price</Form.Label>
                          <Form.Control
                            name="unit_purchase_price"
                            type="number"
                            value={newProduct.unit_purchase_price}
                            onChange={handleNewProductChange}
                            placeholder="0.00"
                          />
                        </Col>
                        <Col md={2} className="mb-2">
                          <Form.Label>Selling Price</Form.Label>
                          <Form.Control
                            name="unit_selling_price"
                            type="number"
                            value={newProduct.unit_selling_price}
                            onChange={handleNewProductChange}
                            placeholder="0.00"
                          />
                        </Col>
                        <Col md={2} className="mb-2">
                          <Form.Label>Category</Form.Label>
                          <Form.Control
                            name="category"
                            value={newProduct.category}
                            onChange={handleNewProductChange}
                            placeholder="Facewash / Serum / etc."
                          />
                        </Col>
                        <Col md={2} className="mb-2">
                          <Form.Label>Size</Form.Label>
                          <Form.Control
                            name="size"
                            value={newProduct.size}
                            onChange={handleNewProductChange}
                            placeholder="e.g. 236ml"
                          />
                        </Col>
                        <Col md={4} className="mb-2 d-flex justify-content-end">
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
                              {adding ? "Adding..." : "Save Product"}
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
                      <th>ID</th>
                      <th>Image</th>
                      <th>Name</th>
                      <th>Brand</th>
                      <th>SKU</th>
                      <th>Units/Carton</th>
                      <th>Buying Price</th>
                      <th>Selling Price</th>
                      <th>Category</th>
                      <th>Size</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredProducts.length > 0 ? (
                      filteredProducts.map((product) => (
                        <tr key={product.id}>
                          <td>{product.id}</td>

                          {/* Image with zoom */}
                          <td>
                            {product.image_url ? (
                              <div
                                onClick={() =>
                                  setSelectedImage(product.image_url)
                                }
                                style={{
                                  width: "80px",
                                  height: "80px",
                                  borderRadius: "8px",
                                  overflow: "hidden",
                                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                                  background: "#fff",
                                  cursor: "zoom-in",
                                }}
                              >
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                  }}
                                />
                              </div>
                            ) : (
                              <span className="text-muted">No image</span>
                            )}
                          </td>

                          <td>{product.name}</td>
                          <td>{product.brand}</td>
                          <td>{product.sku}</td>
                          <td>{product.units_per_carton}</td>
                          <td>{product.unit_purchase_price}</td>
                          <td>{product.unit_selling_price}</td>
                          <td>{product.category}</td>
                          <td>{product.size}</td>
                          <td className="d-flex gap-1">
                            <Button
                              variant="info"
                              size="sm"
                              className="mr-1"
                              onClick={() => openEditModal(product)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeleteProduct(product)}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={11} className="text-center text-danger py-3">
                          No products found!
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

      {/* Image zoom modal */}
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
            alt="Zoomed"
            style={{
              maxWidth: "90%",
              maxHeight: "90%",
              borderRadius: "12px",
              boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
            }}
          />
        </div>
      )}

      {/* ✏️ EDIT PRODUCT - CUSTOM MODAL */}
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
              maxWidth: "900px",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header d-flex justify-content-between align-items-center">
              <h4 className="mb-0">Edit Product</h4>
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
                    <Form.Label>Name *</Form.Label>
                    <Form.Control
                      name="name"
                      value={editForm.name}
                      onChange={handleEditChange}
                    />
                  </Col>
                  <Col md={6} className="mb-2">
                    <Form.Label>Brand</Form.Label>
                    <Form.Control
                      name="brand"
                      value={editForm.brand}
                      onChange={handleEditChange}
                    />
                  </Col>
                </Row>
                <Row>
                  <Col md={4} className="mb-2">
                    <Form.Label>SKU *</Form.Label>
                    <Form.Control
                      name="sku"
                      value={editForm.sku}
                      onChange={handleEditChange}
                    />
                  </Col>
                  <Col md={4} className="mb-2">
                    <Form.Label>Units/Carton</Form.Label>
                    <Form.Control
                      name="units_per_carton"
                      type="number"
                      value={editForm.units_per_carton}
                      onChange={handleEditChange}
                    />
                  </Col>
                  <Col md={4} className="mb-2">
                    <Form.Label>Size</Form.Label>
                    <Form.Control
                      name="size"
                      value={editForm.size}
                      onChange={handleEditChange}
                    />
                  </Col>
                </Row>
                <Row>
                  <Col md={4} className="mb-2">
                    <Form.Label>Buying Price</Form.Label>
                    <Form.Control
                      name="unit_purchase_price"
                      type="number"
                      value={editForm.unit_purchase_price}
                      onChange={handleEditChange}
                    />
                  </Col>
                  <Col md={4} className="mb-2">
                    <Form.Label>Selling Price</Form.Label>
                    <Form.Control
                      name="unit_selling_price"
                      type="number"
                      value={editForm.unit_selling_price}
                      onChange={handleEditChange}
                    />
                  </Col>
                  <Col md={4} className="mb-2">
                    <Form.Label>Category</Form.Label>
                    <Form.Control
                      name="category"
                      value={editForm.category}
                      onChange={handleEditChange}
                    />
                  </Col>
                </Row>
                <Row className="mt-2">
                  <Col md={6} className="mb-2">
                    <Form.Label>Current Image</Form.Label>
                    <div>
                      {editingProduct?.image_url ? (
                        <img
                          src={editingProduct.image_url}
                          alt={editingProduct.name}
                          style={{
                            maxWidth: "100%",
                            maxHeight: "200px",
                            borderRadius: "8px",
                          }}
                        />
                      ) : (
                        <span className="text-muted">No image</span>
                      )}
                    </div>
                  </Col>
                  <Col md={6} className="mb-2">
                    <Form.Label>New Image (optional)</Form.Label>
                    <Form.Control
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        setEditImageFile(e.target.files?.[0] || null)
                      }
                    />
                    <small className="text-muted">
                      If you select a new image, the old one will be deleted from storage.
                    </small>
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

export default ProductList;

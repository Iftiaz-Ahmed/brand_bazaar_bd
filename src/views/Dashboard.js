// src/views/Dashboard.js

import React, { useEffect, useState, useMemo } from "react";
import ChartistGraph from "react-chartist";
import { Card, Table, Container, Row, Col, Badge, Button } from "react-bootstrap";
import { supabase } from "createClient";
import { formatDate } from "../utils/formatDate";

// helper: currency format
const formatCurrency = (value) => {
  const num = Number(value || 0);
  return `৳${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// (currently unused, but kept if you later want wrapped axis labels)
const wrapLabel = (value, maxPerLine = 12) => {
  if (!value) return "";
  const words = String(value).split(/\s+/);
  let line = "";
  const lines = [];
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (test.length > maxPerLine && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines.join("\n");
};

function Dashboard() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revenueRange, setRevenueRange] = useState("7d"); // "7d" | "14d" | "1m" | "6m" | "1y"

  // ---------- FETCH DATA ----------
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError("");

        const [
          { data: ordersData, error: ordersErr },
          { data: productsData, error: productsErr },
        ] = await Promise.all([
          supabase
            .from("orders")
            .select("*")
            .order("created_at", { ascending: true }),
          supabase.from("products").select("*"),
        ]);

        if (ordersErr) {
          console.error("Supabase error (orders):", ordersErr);
          setError(ordersErr.message || "Failed to load orders.");
        }
        if (productsErr) {
          console.error("Supabase error (products):", productsErr);
          setError(
            (prev) => prev || productsErr.message || "Failed to load products."
          );
        }

        setOrders(ordersData || []);
        setProducts(productsData || []);
      } catch (err) {
        console.error("Unexpected dashboard fetch error:", err);
        setError(err?.message || "Unexpected error loading dashboard.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const getProductName = (id) => {
    const p = products.find((x) => x.id === id);
    return p ? p.name : "Unknown Product";
  };

  // ---------- DERIVED METRICS ----------
  const {
    totalRevenue,
    totalOrders,
    paidRevenue,
    unpaidAmount,
    avgOrderValue,
    statusRevenueMap,
    revenueRanges,
    topProducts,
    topProductLabels,
    topProductSeries,
    paidMonthLabels,
    paidMonthSeries,
    grossProfitAll,
    paidProfit,
    avgProfitPerOrder,
    avgProfitPerUnit,
  } = useMemo(() => {
    const result = {
      totalRevenue: 0,
      totalOrders: orders.length,
      paidRevenue: 0,
      unpaidAmount: 0,
      avgOrderValue: 0,
      statusRevenueMap: {},
      revenueRanges: {},
      topProducts: [],
      topProductLabels: [],
      topProductSeries: [],
      paidMonthLabels: [],
      paidMonthSeries: [],
      grossProfitAll: 0,
      paidProfit: 0,
      avgProfitPerOrder: 0,
      avgProfitPerUnit: 0,
    };

    if (orders.length === 0) return result;

    let totalRev = 0;
    let paidRev = 0;
    const statusMap = {};
    const productStats = {}; // productId -> { productId, units, revenue }

    // for dynamic revenue-by-day ranges
    const dayRevenueMap = {}; // YYYY-MM-DD -> revenue (all orders)

    // profit stats
    let grossProfit = 0;
    let paidProfit = 0;
    let totalUnitsSold = 0;

    orders.forEach((order) => {
      const orderTotal = Number(order.total_amount || 0);
      const status = order.status || "Unknown";

      totalRev += orderTotal;
      statusMap[status] = (statusMap[status] || 0) + orderTotal;

      if (status === "Paid") {
        paidRev += orderTotal;
      }

      // revenue per day (based on created_at)
      if (order.created_at) {
        const d = new Date(order.created_at);
        d.setHours(0, 0, 0, 0);
        const key = d.toISOString().slice(0, 10);
        if (!dayRevenueMap[key]) dayRevenueMap[key] = 0;
        dayRevenueMap[key] += orderTotal;
      }

      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((it) => {
        if (!it.product_id) return;
        const pid = it.product_id;

        // product revenue & units
        if (!productStats[pid]) {
          productStats[pid] = { productId: pid, units: 0, revenue: 0 };
        }
        const qty = Number(it.quantity || 0);
        const lineRevenue = Number(it.line_total || 0);
        productStats[pid].units += qty;
        productStats[pid].revenue += lineRevenue;

        // profit (use products table for cost)
        const prod = products.find((p) => p.id === pid);
        const cost = prod?.unit_purchase_price
          ? Number(prod.unit_purchase_price)
          : 0;
        const unitSell = Number(it.unit_price || 0);
        const lineProfit = (unitSell - cost) * qty;

        grossProfit += lineProfit;
        totalUnitsSold += qty;
        if (status === "Paid") {
          paidProfit += lineProfit;
        }
      });
    });

    const unpaid = totalRev - paidRev;
    const avgOrder = orders.length > 0 ? totalRev / orders.length : 0;

    result.totalRevenue = totalRev;
    result.paidRevenue = paidRev;
    result.unpaidAmount = unpaid;
    result.avgOrderValue = avgOrder;
    result.statusRevenueMap = statusMap;

    result.grossProfitAll = grossProfit;
    result.paidProfit = paidProfit;
    result.avgProfitPerOrder =
      orders.length > 0 ? grossProfit / orders.length : 0;
    result.avgProfitPerUnit =
      totalUnitsSold > 0 ? grossProfit / totalUnitsSold : 0;

    // ---- Top products by revenue (top 5) ----
    const productArray = Object.values(productStats);
    productArray.sort((a, b) => b.revenue - a.revenue);
    result.topProducts = productArray.slice(0, 5);

    // Chart labels (#1, #2, #3 …) and series (each product its own series)
    result.topProductLabels = result.topProducts.map((_, i) => `#${i + 1}`);
    result.topProductSeries = result.topProducts.map((p) => [p.revenue]);

    // ---- Revenue by day ranges (7d, 14d, 30d, 180d, 365d) ----
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const buildRange = (daysBack) => {
      const labels = [];
      const seriesVals = [];
      for (let i = daysBack - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
        seriesVals.push(Number(dayRevenueMap[key] || 0));
      }
      return { labels, series: [seriesVals] };
    };

    result.revenueRanges = {
      "7d": buildRange(7),
      "14d": buildRange(14),
      "1m": buildRange(30),
      "6m": buildRange(180),
      "1y": buildRange(365),
    };

    // ---- Monthly PAID revenue (last 6 months, based on updated_at) ----
    const paidMonthMap = {}; // YYYY-MM -> revenue
    const monthsList = [];

    const base = new Date(today);
    base.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const m = new Date(base);
      m.setMonth(base.getMonth() - i);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      monthsList.push({
        key,
        label: `${m.toLocaleString("default", {
          month: "short",
        })} ${String(m.getFullYear()).slice(-2)}`,
      });
      paidMonthMap[key] = 0;
    }

    orders.forEach((order) => {
      if (order.status !== "Paid" || !order.updated_at) return;
      const d = new Date(order.updated_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      if (!(key in paidMonthMap)) return; // ignore older than 6 months
      paidMonthMap[key] += Number(order.total_amount || 0);
    });

    result.paidMonthLabels = monthsList.map((m) => m.label);
    result.paidMonthSeries = [
      monthsList.map((m) => Number(paidMonthMap[m.key] || 0)),
    ];

    return result;
  }, [orders, products]);

  // ---------- CHART DATA ----------

  // current revenue range data
  const currentRevenueData =
    revenueRanges[revenueRange] || revenueRanges["7d"] || {
      labels: [],
      series: [[]],
    };

  const maxDayRevenue = Math.max(
    0,
    ...currentRevenueData.series.reduce(
      (all, series) => all.concat(series),
      []
    )
  );

  // smart label interpolation for X axis: skip some labels when there are many
  const buildAxisXLabelFn = (labels) => {
    const total = labels.length;
    if (total <= 10) {
      return (value) => value;
    }
    const desiredLabels = 8; // show ~8 labels max
    const step = Math.ceil(total / desiredLabels);
    return (value, index) => {
      return index % step === 0 ? value : null;
    };
  };

  const revenueLineOptions = {
    low: 0,
    high: maxDayRevenue > 0 ? maxDayRevenue * 1.2 : 10,
    showArea: true,
    height: "245px",
    axisX: {
      showGrid: false,
      labelInterpolationFnc: buildAxisXLabelFn(
        currentRevenueData.labels || []
      ),
    },
    axisY: {
      offset: 70, // keep space so values don't get cut
    },
    lineSmooth: true,
    showLine: true,
    showPoint: true,
    fullWidth: true,
    chartPadding: {
      right: 30,
    },
  };

  // Pie chart: revenue by status
  const statusKeys = Object.keys(statusRevenueMap);
  const statusTotal = statusKeys.reduce(
    (sum, s) => sum + Number(statusRevenueMap[s] || 0),
    0
  );
  const statusPieData =
    statusKeys.length > 0 && statusTotal > 0
      ? {
          labels: statusKeys.map((status) => {
            const val = Number(statusRevenueMap[status] || 0);
            const pct = Math.round((val / statusTotal) * 100);
            return `${pct}%`;
          }),
          series: statusKeys.map((status) =>
            Number(statusRevenueMap[status] || 0)
          ),
        }
      : {
          labels: ["100%"],
          series: [1],
        };

  // Bar chart: Monthly PAID revenue
  const monthBarData = {
    labels: paidMonthLabels,
    series: paidMonthSeries,
  };

  const monthBarOptions = {
    seriesBarDistance: 10,
    axisX: {
      showGrid: false,
      labelInterpolationFnc: (value) => value,
    },
    axisY: {
      offset: 70,
    },
    height: "245px",
  };

  // ---- Top Products chart data ----
  const topProductBarData =
    topProducts.length > 0
      ? {
          labels: topProductLabels,
          series: topProductSeries,
        }
      : {
          labels: [],
          series: [],
        };

  const topProductBarOptions = {
    seriesBarDistance: 20,
    width: "50%",           // ← makes chart take full container width
    height: "280px",         // ← slightly increased height (optional)

    axisX: {
      showLabel: false,      // ← removes x-axis labels
      showGrid: false,       // ← removes x-axis grid lines
    },

    axisY: {
      offset: 80,            // ← more room so Y labels don’t get cut
      showGrid: true,        // keep Y grid (optional)
    },
  };


  // Match default Chartist series colors from the theme (approximate)
  const productColors = [
    "#1dc7ea", // ct-series-a  (blue/turquoise)
    "#f3545d", // ct-series-b  (red)
    "#fcc468", // ct-series-c  (yellow/orange)
    "#9368e9", // ct-series-d  (purple)
    "#4cbdd7", // ct-series-e  (spare)
  ];


  // Recent orders table (last 5, newest first)
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  const rangeLabelMap = {
    "7d": "Last 7 Days",
    "14d": "Last 14 Days",
    "1m": "Last 1 Month",
    "6m": "Last 6 Months",
    "1y": "Last 1 Year",
  };

  const currentRangeLabel = rangeLabelMap[revenueRange] || "Last 7 Days";
  const dayLabels = currentRevenueData.labels || [];

  // ---------- RENDER ----------
  return (
    <>
    <style>
      {`
        .text-purple {
          color: #9b59b6 !important;
        }
      `}
    </style>
      <Container fluid>
        {/* TOP STATS */}
        <Row>
          <Col lg="3" sm="6">
            <Card className="card-stats">
              <Card.Body>
                <Row>
                  <Col xs="5">
                    <div className="icon-big text-center icon-warning">
                      <i className="nc-icon nc-bank text-success"></i>
                    </div>
                  </Col>
                  <Col xs="7">
                    <div className="numbers">
                      <p className="card-category">Total Revenue</p>
                      <Card.Title as="h4">
                        {formatCurrency(totalRevenue)}
                      </Card.Title>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
              <Card.Footer>
                <hr />
                <div className="stats">All time from all orders</div>
              </Card.Footer>
            </Card>
          </Col>

          <Col lg="3" sm="6">
            <Card className="card-stats">
              <Card.Body>
                <Row>
                  <Col xs="5">
                    <div className="icon-big text-center icon-warning">
                      <i className="nc-icon nc-credit-card text-primary"></i>
                    </div>
                  </Col>
                  <Col xs="7">
                    <div className="numbers">
                      <p className="card-category">Paid Revenue</p>
                      <Card.Title as="h4">
                        {formatCurrency(paidRevenue)}
                      </Card.Title>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
              <Card.Footer>
                <hr />
                <div className="stats">
                  Orders with status <strong>Paid</strong>
                </div>
              </Card.Footer>
            </Card>
          </Col>

          <Col lg="3" sm="6">
            <Card className="card-stats">
              <Card.Body>
                <Row>
                  <Col xs="5">
                    <div className="icon-big text-center icon-warning">
                      {/* fixed: show icon */}
                      <i className="nc-icon nc-money-coins text-danger"></i>
                    </div>
                  </Col>
                  <Col xs="7">
                    <div className="numbers">
                      <p className="card-category">Pending Amount</p>
                      <Card.Title as="h4">
                        {formatCurrency(unpaidAmount)}
                      </Card.Title>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
              <Card.Footer>
                <hr />
                <div className="stats">
                  Total - Paid (Created / Shipped / Delivered)
                </div>
              </Card.Footer>
            </Card>
          </Col>

          <Col lg="3" sm="6">
            <Card className="card-stats">
              <Card.Body>
                <Row>
                  <Col xs="5">
                    <div className="icon-big text-center icon-warning">
                      <i className="nc-icon nc-single-copy-04 text-info"></i>
                    </div>
                  </Col>
                  <Col xs="7">
                    <div className="numbers">
                      <p className="card-category">Orders</p>
                      <Card.Title as="h4">{totalOrders}</Card.Title>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
              <Card.Footer>
                <hr />
                <div className="stats">
                  Avg Order: {formatCurrency(avgOrderValue)}
                </div>
              </Card.Footer>
            </Card>
          </Col>
        </Row>

        {/* PROFIT CARDS (2 extra) */}
        <Row>
          <Col lg="3" sm="6">
            <Card className="card-stats">
              <Card.Body>
                <Row>
                  <Col xs="5">
                    <div className="icon-big text-center icon-warning">
                      <i className="nc-icon nc-chart text-danger"></i>
                    </div>
                  </Col>
                  <Col xs="7">
                    <div className="numbers">
                      <p className="card-category">Gross Profit</p>
                      <Card.Title as="h4">
                        {formatCurrency(grossProfitAll)}
                      </Card.Title>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
              <Card.Footer>
                <hr />
                <div className="stats">
                  <div>Avg Profit / Order: {formatCurrency(avgProfitPerOrder)}</div>
                  <div>Avg Profit / Unit: {formatCurrency(avgProfitPerUnit)}</div>
                </div>
              </Card.Footer>
            </Card>
          </Col>

          <Col lg="3" sm="6">
            <Card className="card-stats">
              <Card.Body>
                <Row>
                  <Col xs="5">
                    <div className="icon-big text-center icon-warning">
                      <i className="nc-icon nc-money-coins text-warning"></i>
                    </div>
                  </Col>
                  <Col xs="7">
                    <div className="numbers">
                      <p className="card-category">Total Paid Profit</p>
                      <Card.Title as="h4">
                        {formatCurrency(paidProfit)}
                      </Card.Title>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
              <Card.Footer>
                <hr />
                <div className="stats">
                  Profit only from <strong>Paid</strong> orders
                </div>
              </Card.Footer>
            </Card>
          </Col>
        </Row>

        {/* REVENUE OVER TIME + STATUS SPLIT */}
        <Row>
          <Col md="8">
            <Card>
              <Card.Header>
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <Card.Title as="h4">Revenue ({currentRangeLabel})</Card.Title>
                    <p className="card-category">
                      Daily total amount from all orders
                    </p>
                  </div>
                  <div>
                    <Button
                      size="sm"
                      variant={revenueRange === "7d" ? "info" : "outline-info"}
                      className="mr-1"
                      onClick={() => setRevenueRange("7d")}
                    >
                      7d
                    </Button>
                    <Button
                      size="sm"
                      variant={revenueRange === "14d" ? "info" : "outline-info"}
                      className="mr-1"
                      onClick={() => setRevenueRange("14d")}
                    >
                      14d
                    </Button>
                    <Button
                      size="sm"
                      variant={revenueRange === "1m" ? "info" : "outline-info"}
                      className="mr-1"
                      onClick={() => setRevenueRange("1m")}
                    >
                      1m
                    </Button>
                    <Button
                      size="sm"
                      variant={revenueRange === "6m" ? "info" : "outline-info"}
                      className="mr-1"
                      onClick={() => setRevenueRange("6m")}
                    >
                      6m
                    </Button>
                    <Button
                      size="sm"
                      variant={revenueRange === "1y" ? "info" : "outline-info"}
                      onClick={() => setRevenueRange("1y")}
                    >
                      1y
                    </Button>
                  </div>
                </div>
              </Card.Header>
              <Card.Body>
                <div className="ct-chart" id="chartRevenueDays">
                  <ChartistGraph
                    data={currentRevenueData}
                    type="Line"
                    options={revenueLineOptions}
                    responsiveOptions={[
                      [
                        "screen and (max-width: 640px)",
                        {
                          axisX: {
                            labelInterpolationFnc: function (value, index) {
                              // keep same skipping logic on mobile
                              return revenueLineOptions.axisX.labelInterpolationFnc(
                                value,
                                index
                              );
                            },
                          },
                        },
                      ],
                    ]}
                  />
                </div>
              </Card.Body>
              <Card.Footer>
                <hr />
                <div className="stats">
                  {loading
                    ? "Loading data..."
                    : dayLabels.length > 0
                    ? `Showing ${currentRangeLabel.toLowerCase()} (${dayLabels[0]} - ${
                        dayLabels[dayLabels.length - 1]
                      })`
                    : "No data in selected range"}
                </div>
              </Card.Footer>
            </Card>
          </Col>

          <Col md="4">
            <Card>
              <Card.Header>
                <Card.Title as="h4">Revenue by Status</Card.Title>
                <p className="card-category">
                  Distribution of revenue across order statuses
                </p>
              </Card.Header>
              <Card.Body>
                <div className="ct-chart ct-perfect-fourth" id="chartStatus">
                  <ChartistGraph data={statusPieData} type="Pie" />
                </div>
                <div className="legend">
                  {statusKeys.length === 0 ? (
                    <span>No data yet</span>
                  ) : (
                    statusKeys.map((status, idx) => (
                      <div key={status}>
                        <i
                          className={`fas fa-circle ${
                            idx % 4 === 0
                              ? "text-info"      // blue
                              : idx % 4 === 1
                              ? "text-danger"    // red
                              : idx % 4 === 2
                              ? "text-warning"   // yellow
                              : "text-purple"    // purple
                          }`}
                        ></i>{" "}
                        {status} – {formatCurrency(statusRevenueMap[status])}
                      </div>
                    ))
                  )}
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* MONTHLY PAID REVENUE & TOP PRODUCTS + RECENT ORDERS */}
        <Row>
          <Col md="6">
            <Card>
              <Card.Header>
                <Card.Title as="h4">Monthly Paid Revenue</Card.Title>
                <p className="card-category">
                  Last 6 months, only <strong>Paid</strong> orders
                </p>
              </Card.Header>
              <Card.Body>
                <div className="ct-chart" id="chartMonthlyRevenue">
                  <ChartistGraph
                    data={monthBarData}
                    type="Bar"
                    options={monthBarOptions}
                    responsiveOptions={[
                      [
                        "screen and (max-width: 640px)",
                        {
                          seriesBarDistance: 5,
                          axisX: {
                            labelInterpolationFnc: function (value) {
                              return value;
                            },
                          },
                        },
                      ],
                    ]}
                  />
                </div>
              </Card.Body>
              <Card.Footer>
                <hr />
                <div className="stats">
                  Cash actually received per month (Paid orders)
                </div>
              </Card.Footer>
            </Card>

            <Card>
              <Card.Header>
                <Card.Title as="h4">Top Products by Revenue</Card.Title>
                <p className="card-category">From all order line items</p>
              </Card.Header>
              <Card.Body>
                {topProducts.length === 0 ? (
                  <div className="text-center text-muted py-4">
                    No product sales data yet.
                  </div>
                ) : (
                  <>
                    <div className="ct-chart" id="chartTopProducts">
                      <ChartistGraph
                        data={topProductBarData}
                        type="Bar"
                        options={topProductBarOptions}
                        responsiveOptions={[
                          [
                            "screen and (max-width: 640px)",
                            {
                              seriesBarDistance: 5,
                              axisX: {
                                labelInterpolationFnc: function (value) {
                                  return value;
                                },
                              },
                            },
                          ],
                        ]}
                      />
                    </div>
                    {/* Legend with full product names */}
                    <div className="legend mt-2">
                      {topProducts.map((p, idx) => {
                        const color = productColors[idx % productColors.length];
                        return (
                          <div key={p.productId}>
                            <i className="fas fa-circle" style={{ color }}></i>{" "}
                            #{idx + 1} – {getProductName(p.productId)} (
                            {formatCurrency(p.revenue)})
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col md="6">
            <Card className="card-tasks">
              <Card.Header>
                <Card.Title as="h4">Recent Orders</Card.Title>
                <p className="card-category">
                  Latest 5 orders with status & totals
                </p>
              </Card.Header>
              <Card.Body>
                <div className="table-full-width">
                  <Table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Total</th>
                        <th>Created At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center text-muted">
                            No orders yet.
                          </td>
                        </tr>
                      ) : (
                        recentOrders.map((o) => (
                          <tr key={o.id}>
                            <td>#{o.id}</td>
                            <td>
                              <div>{o.customer_name || "Unknown"}</div>
                              {o.customer_phone && (
                                <small className="text-muted">
                                  {o.customer_phone}
                                </small>
                              )}
                            </td>
                            <td>
                              <Badge
                                variant={
                                  o.status === "Paid"
                                    ? "success"
                                    : o.status === "Delivered"
                                    ? "info"
                                    : o.status === "Shipped"
                                    ? "warning"
                                    : "secondary"
                                }
                              >
                                {o.status || "Unknown"}
                              </Badge>
                            </td>
                            <td>{formatCurrency(o.total_amount || 0)}</td>
                            <td>
                              {o.created_at ? formatDate(o.created_at) : "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>
              </Card.Body>
              <Card.Footer>
                <hr />
                <div className="stats">
                  {error
                    ? `Error: ${error}`
                    : loading
                    ? "Loading..."
                    : `Total orders: ${orders.length}`}
                </div>
              </Card.Footer>
            </Card>
          </Col>
        </Row>
      </Container>
    </>
  );
}

export default Dashboard;

import QRCode from "qrcode";

const QUIET_ZONE = 4;
const MODULE_SCALE = 8;
const RED = "#ed1c24";
const LIGHT = "#fff9eb";

export function createOfficeQrSvg(url) {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "H" });
  const size = modules.size;
  const dimension = size + QUIET_ZONE * 2;
  const triangles = [];
  const squares = [];

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!modules.get(row, column)) continue;
      const x = column + QUIET_ZONE;
      const y = row + QUIET_ZONE;
      if (isFinderModule(row, column, size)) {
        squares.push(`M${x} ${y}h1v1h-1z`);
      } else {
        triangles.push(
          `M${x + 0.5} ${y + 0.02}L${x + 0.98} ${y + 0.94}H${x + 0.02}z`,
        );
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" width="${dimension * MODULE_SCALE}" height="${dimension * MODULE_SCALE}" shape-rendering="crispEdges" role="img" aria-label="Agent portal QR code">`,
    `<title>Agent portal: ${escapeXml(url)}</title>`,
    `<rect width="${dimension}" height="${dimension}" fill="${LIGHT}"/>`,
    `<path fill="${RED}" d="${squares.join("")}"/>`,
    `<path fill="${RED}" d="${triangles.join("")}"/>`,
    "</svg>",
  ].join("");
}

function isFinderModule(row, column, size) {
  return (
    (row < 8 && column < 8) ||
    (row < 8 && column >= size - 8) ||
    (row >= size - 8 && column < 8)
  );
}

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (character) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

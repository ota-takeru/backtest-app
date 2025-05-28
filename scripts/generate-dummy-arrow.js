import {
  tableToIPC,
  makeTable,
  vectorFromArray,
  Float64,
  Int64,
  DateMillisecond,
} from "apache-arrow";
import fs from "fs";
import path from "path";

// ダミーOHLCVデータ生成関数
function generateDummyData(days = 22) {
  // 約1ヶ月分 (22営業日)
  const data = [];
  let date = new Date(2023, 0, 1); // 2023-01-01 から開始
  let close = 1000;
  let volumeBase = 100000;

  for (let i = 0; i < days; i++) {
    // 日付を進める (週末をスキップする簡単なロジック)
    date.setDate(date.getDate() + 1);
    if (date.getDay() === 6) {
      // 土曜日
      date.setDate(date.getDate() + 2);
    } else if (date.getDay() === 0) {
      // 日曜日
      date.setDate(date.getDate() + 1);
    }

    const openNoise = (Math.random() - 0.5) * 20; // -10 to 10
    const highLowNoise = Math.random() * 10; // 0 to 10
    const volumeNoise = (Math.random() - 0.5) * 50000;

    let open = close + openNoise;
    if (open < 10) open = 10; // 最低価格

    let high = Math.max(open, close) + highLowNoise;
    let low = Math.min(open, close) - highLowNoise;
    if (low < 5) low = 5; // 最低価格
    if (high < low) high = low + Math.random() * 5; // highはlowより高く

    // 価格のトレンドを擬似的に作る
    if (i < days / 3) {
      // 上昇トレンド
      close += Math.random() * 15;
    } else if (i < (days * 2) / 3) {
      // レンジ
      close += (Math.random() - 0.5) * 10;
    } else {
      // 下降トレンド
      close -= Math.random() * 15;
    }
    if (close < 10) close = 10; // 最低価格

    const volume = volumeBase + volumeNoise;

    data.push({
      date: new Date(date.getTime()), // UTCタイムスタンプとしてDateオブジェクトを保持
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: parseInt(volume.toString(), 10),
    });
  }
  return data;
}

const dummyData = generateDummyData(66); // 約3ヶ月分のデータを生成

// 各列のVectorを作成
const dateVector = vectorFromArray(
  dummyData.map((d) => d.date.getTime()),
  new DateMillisecond()
);
const openVector = vectorFromArray(
  dummyData.map((d) => d.open),
  new Float64()
);
const highVector = vectorFromArray(
  dummyData.map((d) => d.high),
  new Float64()
);
const lowVector = vectorFromArray(
  dummyData.map((d) => d.low),
  new Float64()
);
const closeVector = vectorFromArray(
  dummyData.map((d) => d.close),
  new Float64()
);
const volumeVector = vectorFromArray(
  dummyData.map((d) => BigInt(d.volume)),
  new Int64()
);

// makeTableを使用してTableオブジェクトを作成
const table = makeTable({
  date: dateVector,
  open: openVector,
  high: highVector,
  low: lowVector,
  close: closeVector,
  volume: volumeVector,
});

// Arrow IPC形式でファイルに書き出す
const targetDir = path.resolve(process.cwd(), "fixtures");
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}
const filePath = path.resolve(targetDir, "dummy.arrow");

async function writeArrowFile() {
  try {
    // tableToIPC を使用して Uint8Array を直接取得 (ファイル形式)
    const ipc = tableToIPC(table, "file");
    fs.writeFileSync(filePath, ipc);
    console.log(`Dummy Arrow file generated at: ${filePath}`);
  } catch (error) {
    console.error("Failed to generate Arrow file:", error);
  }
}

writeArrowFile();

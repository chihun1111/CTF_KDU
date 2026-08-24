const JPEG_TEMPLATE = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48,
  0x00, 0x00, 0xff, 0xd9,
]);

const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

export type GeneratedChallengeArtifact = {
  body: Buffer;
  extension: "bin" | "jpg" | "log" | "pcap";
};

export function generateChallengeArtifact(publicChallengeId: string, flag: string): GeneratedChallengeArtifact {
  if (publicChallengeId === "02") {
    return { body: generateStudentCardArtifact(flag), extension: "jpg" };
  }
  if (publicChallengeId === "04") {
    return { body: generateDnsPcapArtifact(flag), extension: "pcap" };
  }
  if (publicChallengeId === "05") {
    return { body: generateAccessLogArtifact(flag), extension: "log" };
  }
  if (publicChallengeId === "06") {
    return { body: generateClubFeeToolArtifact(flag), extension: "bin" };
  }

  throw new Error("Unsupported artifact challenge");
}

function generateStudentCardArtifact(flag: string): Buffer {
  const memo = Buffer.from(`Student Support Center attachment memo\n${flag}\n`, "utf8");
  return Buffer.concat([JPEG_TEMPLATE, createStoredZip("memo.txt", memo)]);
}

function createStoredZip(filename: string, content: Buffer): Buffer {
  const filenameBytes = Buffer.from(filename, "utf8");
  const crc = crc32(content);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(content.byteLength, 18);
  localHeader.writeUInt32LE(content.byteLength, 22);
  localHeader.writeUInt16LE(filenameBytes.byteLength, 26);
  localHeader.writeUInt16LE(0, 28);

  const centralDirectory = Buffer.alloc(46);
  centralDirectory.writeUInt32LE(0x02014b50, 0);
  centralDirectory.writeUInt16LE(20, 4);
  centralDirectory.writeUInt16LE(20, 6);
  centralDirectory.writeUInt16LE(0, 8);
  centralDirectory.writeUInt16LE(0, 10);
  centralDirectory.writeUInt16LE(0, 12);
  centralDirectory.writeUInt16LE(0, 14);
  centralDirectory.writeUInt32LE(crc, 16);
  centralDirectory.writeUInt32LE(content.byteLength, 20);
  centralDirectory.writeUInt32LE(content.byteLength, 24);
  centralDirectory.writeUInt16LE(filenameBytes.byteLength, 28);
  centralDirectory.writeUInt16LE(0, 30);
  centralDirectory.writeUInt16LE(0, 32);
  centralDirectory.writeUInt16LE(0, 34);
  centralDirectory.writeUInt16LE(0, 36);
  centralDirectory.writeUInt32LE(0, 38);
  centralDirectory.writeUInt32LE(0, 42);

  const centralDirectoryOffset = localHeader.byteLength + filenameBytes.byteLength + content.byteLength;
  const centralDirectorySize = centralDirectory.byteLength + filenameBytes.byteLength;
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(1, 8);
  endRecord.writeUInt16LE(1, 10);
  endRecord.writeUInt32LE(centralDirectorySize, 12);
  endRecord.writeUInt32LE(centralDirectoryOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([localHeader, filenameBytes, content, centralDirectory, filenameBytes, endRecord]);
}

function crc32(content: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc = (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function generateDnsPcapArtifact(flag: string): Buffer {
  const globalHeader = Buffer.alloc(24);
  globalHeader.writeUInt32LE(0xa1b2c3d4, 0);
  globalHeader.writeUInt16LE(2, 4);
  globalHeader.writeUInt16LE(4, 6);
  globalHeader.writeInt32LE(0, 8);
  globalHeader.writeUInt32LE(0, 12);
  globalHeader.writeUInt32LE(65535, 16);
  globalHeader.writeUInt32LE(1, 20);

  const flagHex = Buffer.from(flag, "utf8").toString("hex");
  const chunks = flagHex.match(/.{1,8}/g) ?? [];
  const packets = chunks.map((chunk, index) =>
    createPcapPacket(createDnsQueryPacket(`${String(index + 1).padStart(2, "0")}-${chunk}`), index),
  );

  return Buffer.concat([globalHeader, ...packets]);
}

function createPcapPacket(packet: Buffer, index: number): Buffer {
  const recordHeader = Buffer.alloc(16);
  recordHeader.writeUInt32LE(1_778_256_000 + index, 0);
  recordHeader.writeUInt32LE(0, 4);
  recordHeader.writeUInt32LE(packet.byteLength, 8);
  recordHeader.writeUInt32LE(packet.byteLength, 12);
  return Buffer.concat([recordHeader, packet]);
}

function createDnsQueryPacket(firstLabel: string): Buffer {
  const qname = encodeDnsName([firstLabel, "exfil", "campus", "local"]);
  const dnsHeader = Buffer.alloc(12);
  dnsHeader.writeUInt16BE(0x4500, 0);
  dnsHeader.writeUInt16BE(0x0100, 2);
  dnsHeader.writeUInt16BE(1, 4);
  const questionTail = Buffer.alloc(4);
  questionTail.writeUInt16BE(1, 0);
  questionTail.writeUInt16BE(1, 2);
  const dns = Buffer.concat([dnsHeader, qname, questionTail]);

  const udp = Buffer.alloc(8);
  udp.writeUInt16BE(53000, 0);
  udp.writeUInt16BE(53, 2);
  udp.writeUInt16BE(udp.byteLength + dns.byteLength, 4);

  const ip = Buffer.alloc(20);
  ip[0] = 0x45;
  ip.writeUInt16BE(ip.byteLength + udp.byteLength + dns.byteLength, 2);
  ip.writeUInt16BE(0x4000, 6);
  ip[8] = 64;
  ip[9] = 17;
  ip.set([10, 20, 30, 40], 12);
  ip.set([10, 20, 30, 53], 16);
  ip.writeUInt16BE(ipv4HeaderChecksum(ip), 10);

  const ethernet = Buffer.from([0x02, 0x00, 0x00, 0x00, 0x00, 0x53, 0x02, 0x00, 0x00, 0x00, 0x00, 0x40, 0x08, 0x00]);
  return Buffer.concat([ethernet, ip, udp, dns]);
}

function encodeDnsName(labels: string[]): Buffer {
  return Buffer.concat([
    ...labels.map((label) => {
      const bytes = Buffer.from(label, "ascii");
      return Buffer.concat([Buffer.from([bytes.byteLength]), bytes]);
    }),
    Buffer.from([0]),
  ]);
}

function ipv4HeaderChecksum(header: Buffer): number {
  let sum = 0;
  for (let index = 0; index < header.byteLength; index += 2) {
    sum += header.readUInt16BE(index);
    while (sum > 0xffff) {
      sum = (sum & 0xffff) + (sum >>> 16);
    }
  }
  return (~sum) & 0xffff;
}

function generateAccessLogArtifact(flag: string): Buffer {
  const encodedFlag = encodeURIComponent(flag);
  return Buffer.from(
    [
      '10.20.30.11 - - [06/May/2026:03:12:04 +0900] "GET /assets/main.css HTTP/1.1" 200 412 "-" "CampusPortal/2.1"',
      `10.20.30.40 - - [06/May/2026:03:17:22 +0900] "GET /staff/memo?memo=${encodedFlag} HTTP/1.1" 200 132 "-" "LostFoundBot/1.0"`,
      '10.20.30.12 - - [06/May/2026:03:19:51 +0900] "POST /lost-items/search HTTP/1.1" 200 944 "-" "CampusPortal/2.1"',
      "",
    ].join("\n"),
    "utf8",
  );
}

function generateClubFeeToolArtifact(claimToken: string): Buffer {
  const encodedToken = Buffer.from(claimToken, "utf8").toString("base64");
  return Buffer.from(
    [
      "#!/usr/bin/env node",
      "const readline = require('node:readline');",
      "const rl = readline.createInterface({ input: process.stdin, output: process.stdout });",
      "function decode(value) { return Buffer.from(value, 'base64').toString('utf8'); }",
      "function score(value) { return [...value].reduce((sum, ch, index) => sum + ((ch.charCodeAt(0) ^ (index + 17)) & 255), 0); }",
      "rl.question('admin code: ', (answer) => {",
      "  if (answer.length === 20 && score(answer) === 2278) {",
      `    console.log(decode('${encodedToken}'));`,
      "  } else {",
      "    console.log('payment record locked');",
      "  }",
      "  rl.close();",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );
}

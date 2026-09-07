// OpenEir — live validation of msedge-tts (server-side Edge neural TTS).
// Verifies: DRM token handshake, synthesis, MP3 output integrity.
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { writeFile } from "node:fs/promises";

const OUT = "/home/z/my-project/scripts/edge-test.mp3";

async function main() {
  const tts = new MsEdgeTTS({ enableLogger: false });
  await tts.setMetadata(
    "en-US-AndrewMultilingualNeural",
    OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
  );

  const text =
    "Blood pressure one twenty two over seventy eight, pulse sixty four. Is this correct?";
  const { audioStream } = tts.toStream(text, { rate: 1, pitch: "+0Hz", volume: 100 });

  const chunks = [];
  for await (const chunk of audioStream) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  tts.close();

  await writeFile(OUT, buf);
  const magic = buf.subarray(0, 3);
  const isMp3 = magic[0] === 0x49 && magic[1] === 0x44 && magic[2] === 0x33 || buf[0] === 0xff;
  console.log("bytes:", buf.length);
  console.log("magic:", [...magic].map((b) => b.toString(16).padStart(2, "0")).join(" "));
  console.log("valid mp3 header:", isMp3);
  if (buf.length < 1000 || !isMp3) {
    console.error("FAILED — synthesis did not produce valid audio");
    process.exit(1);
  }
  console.log("OK — Edge TTS synthesis works");
}

main().catch((e) => {
  console.error("EDGE TTS FAILED:", e?.message ?? e);
  process.exit(1);
});

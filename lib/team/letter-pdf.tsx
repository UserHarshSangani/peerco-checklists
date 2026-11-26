import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { parseLetter } from "./letter";

// The built-in PDF fonts have no ₹ sign, so amounts on the letter use "Rs."
const styles = StyleSheet.create({
  page: { paddingVertical: 56, paddingHorizontal: 60, fontSize: 11, lineHeight: 1.5, fontFamily: "Helvetica" },
  heading: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 6 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 14, textAlign: "center" },
  paragraph: { marginBottom: 8 },
  bulletRow: { flexDirection: "row", marginBottom: 2, paddingLeft: 8 },
  bulletDot: { width: 12 },
  bulletText: { flex: 1 },
  footer: { position: "absolute", bottom: 28, left: 60, right: 60, fontSize: 8, color: "#888", textAlign: "center" },
});

export async function renderLetterPdf(filledText: string, footer: string): Promise<Buffer> {
  const blocks = parseLetter(filledText);
  const doc = (
    <Document title="Letter of appointment">
      <Page size="A4" style={styles.page}>
        {blocks.map((block, i) => {
          if (block.kind === "heading") {
            return (
              <Text key={i} style={i === 0 ? styles.title : styles.heading}>
                {block.text}
              </Text>
            );
          }
          if (block.kind === "bullets") {
            return (
              <View key={i} style={styles.paragraph}>
                {block.items.map((item, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            );
          }
          return (
            <Text key={i} style={styles.paragraph}>
              {block.lines.join("\n")}
            </Text>
          );
        })}
        <Text style={styles.footer} fixed>
          {footer}
        </Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}

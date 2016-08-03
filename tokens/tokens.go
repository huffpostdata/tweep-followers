package tokens

import (
	"bytes"
	"tweep-followers/segment"
)

// Tokenize() parses the 160-char bio and outputs lowercase
// UTF-8 tokens separated by ASCII space (between each token).
// It returns the number of bytes written to `out`.
//
// `in` should be a byte array with <=640 bytes; `out` should be a byte array
// with >=640 bytes.
func Tokenize(data []byte) string {
	var buf bytes.Buffer

	var last byte
	for i, bytes := range segment.SegmentWordsDirect(data) {
		if bytes[0] == '#' || bytes[0] == '@' || bytes[0] == ' ' || bytes[0] == '\n' || bytes[0] == '\t' || bytes[0] == '\r' {
			last = bytes[0]
		} else {
			if i != 0 {
				buf.WriteByte(' ')
			}

			if last == '#' || last == '@' {
				buf.WriteByte(last)
			}

			buf.Write(bytes)

			last = 0
		}
	}

	return buf.String()
}

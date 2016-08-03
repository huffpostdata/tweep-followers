package compression

// #cgo LDFLAGS: -lm -lxdelta3
// #include <xdelta3.h>
import "C"

import (
	"errors"
	"unsafe"
)

// Returns an uncompressed byte array which is a slice of destination_buf
func XdeltaDecompress(dictionary []byte, source []byte, destination_buf []byte) ([]byte, error) {
	var out_len C.usize_t

	dictionary_p := unsafe.Pointer(&dictionary[0])
	source_p := unsafe.Pointer(&source[0])
	destination_buf_p := unsafe.Pointer(&destination_buf[0])

	ret := C.xd3_decode_memory(
		(*C.uint8_t)(source_p),
		C.usize_t(len(source)),
		(*C.uint8_t)(dictionary_p),
		C.usize_t(len(dictionary)),
		(*C.uint8_t)(destination_buf_p),
		&out_len,
		C.usize_t(len(destination_buf)),
		0)
	if ret != 0 {
		return nil, errors.New("Decode failed")
	}

	return destination_buf[0:out_len], nil
}

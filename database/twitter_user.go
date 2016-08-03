package database

import (
	"bytes"
	"compress/zlib"
	"database/sql"
	"encoding/json"
	"io/ioutil"
	"tweep-followers/compression"
)

type TwitterUser struct {
	Id          int64
	Description string
}

type TwitterUserFunc func(*TwitterUser) error

func decompressTwitterUserBytes(in []byte, dictionary []byte, buf []byte) ([]byte, error) {
	b := bytes.NewReader(in)
	z, err := zlib.NewReader(b)
	if err != nil {
		return nil, err
	}
	defer z.Close()

	delta, err := ioutil.ReadAll(z)
	if err != nil {
		return nil, err
	}

	raw, err := compression.XdeltaDecompress(dictionary, delta, buf)
	if err != nil {
		return nil, err
	}

	return raw, nil
}

func WithAllUsers(db *sql.DB, f TwitterUserFunc) error {
	buf := make([]byte, 100000)

	dictionary, err := ioutil.ReadFile("./lib/vcdiff-dictionary.fzm")
	if err != nil {
		return err
	}

	rows, err := db.Query("SELECT compressed_json FROM users_lookup_http_cache")
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var compressedJsonBytes sql.RawBytes
		err = rows.Scan(&compressedJsonBytes)
		if err != nil {
			return err
		}
		if len(compressedJsonBytes) == 0 {
			continue
		}

		jsonBytes, err := decompressTwitterUserBytes(compressedJsonBytes, dictionary, buf)
		if err != nil {
			return err
		}

		var twitterUser TwitterUser
		err = json.Unmarshal(jsonBytes, &twitterUser)
		if err != nil {
			return err
		}

		f(&twitterUser)
	}
	err = rows.Err()
	if err != nil {
		return err
	}

	return nil
}

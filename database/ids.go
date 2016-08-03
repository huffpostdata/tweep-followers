package database

import (
	"database/sql"
	"encoding/json"
)

func loadIdsInternal(stmt *sql.Stmt, screen_name string, cursor int64) ([]int64, int64, error) {
	type FollowersResponse struct {
		Ids         []int64
		Next_cursor int64
	}

	rows, err := stmt.Query(screen_name, cursor)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	for rows.Next() {
		var json_bytes sql.RawBytes
		err = rows.Scan(&json_bytes)
		if err != nil {
			return nil, 0, err
		}

		var response FollowersResponse
		err = json.Unmarshal(json_bytes, &response)
		if err != nil {
			return nil, 0, err
		}

		return response.Ids, response.Next_cursor, nil
	}
	err = rows.Err()
	if err != nil {
		return nil, 0, err
	}

	return make([]int64, 0), 0, nil
}

func ReadFollowerIds(db *sql.DB, screen_name string, cursor int64) ([]int64, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("SELECT json FROM followers_ids_http_cache WHERE screen_name = ? AND cursor = ?")
	if err != nil {
		return nil, err
	}
	defer stmt.Close()

	ret := make([]int64, 0)

	for {
		if cursor == 0 {
			return ret, nil
		}

		some_ids, next_cursor, err := loadIdsInternal(stmt, screen_name, cursor)
		if err != nil {
			return nil, err
		}

		ret = append(ret, some_ids...)

		cursor = next_cursor
	}

	return ret, nil
}

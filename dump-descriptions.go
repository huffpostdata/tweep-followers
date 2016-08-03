package main

// Outputs a CSV with id,follows_user1,follows_user2,description
//
// In Twitter's API, "description" is the user's bio.

import (
	"database/sql"
	"encoding/csv"
	_ "github.com/mattn/go-sqlite3"
	"log"
	"os"
	"strconv"
	"tweep-followers/database"
)

func booltoa(b bool) string {
	if b {
		return "1"
	} else {
		return "0"
	}
}

func makeSetFromIds(ids []int64) map[int64]bool {
	set := make(map[int64]bool, len(ids))

	for _, id := range ids {
		set[id] = true
	}

	return set
}

func writeTwoFollowerDescriptionsToCsv(db *sql.DB, screenName1 string, screenName2 string, csvWriter *csv.Writer) error {
	ids1, err := database.ReadFollowerIds(db, "hillaryclinton", -1)
	if err != nil {
		return err
	}
	idSet1 := makeSetFromIds(ids1)
	log.Printf("Loaded %d %s follower IDs", len(ids1), screenName1)

	ids2, err := database.ReadFollowerIds(db, "realDonaldTrump", -1)
	if err != nil {
		return err
	}
	idSet2 := makeSetFromIds(ids2)
	log.Printf("Loaded %d realDonaldTrump follower IDs", len(ids2))

	nScanned := 0
	err = database.WithAllUsers(db, func(user *database.TwitterUser) error {
		nScanned += 1
		if nScanned%100000 == 0 {
			log.Printf("Done %d...\n", nScanned)
		}

		if !idSet1[user.Id] && !idSet2[user.Id] {
			return nil
		}

		err := csvWriter.Write([]string{
			strconv.FormatInt(user.Id, 10),
			booltoa(idSet1[user.Id]),
			booltoa(idSet2[user.Id]),
			user.Description, // even if it's empty
		})
		return err
	})
	return err
}

func main() {
	if len(os.Args) != 4 {
		log.Fatal("Usage: %s DATABASE NAME1 NAME2", os.Args[0])
	}

	db, err := sql.Open("sqlite3", os.Args[1]+"?mode=ro")
	if err != nil {
		log.Fatal(err)
	}

	csvWriter := csv.NewWriter(os.Stdout)

	err = writeTwoFollowerDescriptionsToCsv(db, os.Args[2], os.Args[3], csvWriter)
	if err != nil {
		log.Fatal(err)
	}

	csvWriter.Flush()

	if err := csvWriter.Error(); err != nil {
		log.Fatal(err)
	}
}

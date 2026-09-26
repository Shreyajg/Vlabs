from firebase import db


def main():
    docs = db.collection("experimentRuns").limit(5).stream()

    for doc in docs:
        print(f"Document ID: {doc.id}")
        print(doc.to_dict())
        print("-" * 60)


if __name__ == "__main__":
    main()
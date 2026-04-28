# Character Info

Store one JSON file per character in this folder.

## File naming
Use the character name as the filename, for example:
- `Jack Shephard.json`
- `Kate Austen.json`
- `Sawyer.json`

## Supported fields
Each file can include:
- `name`
- `subtitle`
- `bio`
- `image` (relative path, such as `img/character/Jack_Shephard.jpg`)
- `facts` (object of label/value pairs)
- `tags` (array of short keywords)
- `summary`
- `role`
- `title`

The page will load the matching file automatically when a character is selected.
If a file is missing, the card falls back to the generated data summary and image probing.

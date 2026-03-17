// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title YunjianNotes
 * @notice 云笺笔记合约，部署在 XLayer 网络
 * @dev 每个地址独立存储自己的笔记，支持批量保存
 */
contract YunjianNotes {
    struct Note {
        bytes32 id;
        string  title;
        string  content;
        uint256 createdAt;
        uint256 updatedAt;
        bool    exists;
    }

    // owner => noteId => Note
    mapping(address => mapping(bytes32 => Note)) private _notes;
    // owner => noteId[]（保留顺序）
    mapping(address => bytes32[]) private _noteIds;
    // owner => noteId => deleted
    mapping(address => mapping(bytes32 => bool)) private _deleted;

    event NoteSaved(address indexed owner, bytes32 indexed noteId, string title);
    event NoteDeleted(address indexed owner, bytes32 indexed noteId);

    // ── 单条保存 ──
    function saveNote(
        bytes32 noteId,
        string calldata title,
        string calldata content
    ) external {
        _saveOne(msg.sender, noteId, title, content);
    }

    // ── 批量保存（一次交易上传多条笔记）──
    function saveNotes(
        bytes32[] calldata noteIds,
        string[]  calldata titles,
        string[]  calldata contents
    ) external {
        require(
            noteIds.length == titles.length && titles.length == contents.length,
            "Length mismatch"
        );
        for (uint256 i = 0; i < noteIds.length; i++) {
            _saveOne(msg.sender, noteIds[i], titles[i], contents[i]);
        }
    }

    // ── 删除笔记（标记删除，不物理移除）──
    function deleteNote(bytes32 noteId) external {
        _deleted[msg.sender][noteId] = true;
        _notes[msg.sender][noteId].updatedAt = block.timestamp;
        emit NoteDeleted(msg.sender, noteId);
    }

    // ── 查询所有笔记（含删除标记）──
    function getAllNotes(address owner)
        external
        view
        returns (Note[] memory notes, bool[] memory deletedFlags)
    {
        bytes32[] memory ids = _noteIds[owner];
        notes        = new Note[](ids.length);
        deletedFlags = new bool[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            notes[i]        = _notes[owner][ids[i]];
            deletedFlags[i] = _deleted[owner][ids[i]];
        }
    }

    // ── 内部：保存单条 ──
    function _saveOne(
        address owner,
        bytes32 noteId,
        string calldata title,
        string calldata content
    ) internal {
        Note storage note = _notes[owner][noteId];
        if (!note.exists) {
            note.createdAt = block.timestamp;
            note.exists    = true;
            note.id        = noteId;
            _noteIds[owner].push(noteId);
        }
        note.title   = title;
        note.content = content;
        note.updatedAt = block.timestamp;
        _deleted[owner][noteId] = false;
        emit NoteSaved(owner, noteId, title);
    }
}

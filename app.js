import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import fs from "fs";
import fsPromises from "fs/promises";

const app = express();

app.use(express.json());
app.use(cors());

const unityAPIKey = process.env.UNITY_API_KEY;

const cdnAccessKey = process.env.CDN_ACCESS_KEY;
const cdnStorageZoneName = process.env.CDN_STORAGE_ZONE_NAME;

const cdnStorageDeleteFile = async (directoryPath, fileName) => {
    await fetch(`https://storage.bunnycdn.com/${encodeURIComponent(cdnStorageZoneName)}/${encodeURIComponent(directoryPath)}/${encodeURIComponent(fileName)}`, {
        method: "DELETE",
        headers: {
            "AccessKey": cdnAccessKey
        }
    });
}

const cdnStorageUploadFile = async (localFilePath, targetDirectoryPath, targetFileName) => {
    const fileStream = fs.createReadStream(localFilePath);

    await fetch(`https://storage.bunnycdn.com/${encodeURIComponent(cdnStorageZoneName)}/${encodeURIComponent(targetDirectoryPath)}/${encodeURIComponent(targetFileName)}`, {
        method: "PUT",
        body: fileStream,
        headers: {
            "Content-Type": "application/octet-stream",
            "AccessKey": cdnAccessKey
        }
    });
}

const cdnPurge = async () => {
    await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(`https://${cdnStorageZoneName}.b-cdn.net/*`)}`, {
        method: "POST",
        headers: {
            "AccessKey": cdnAccessKey
        }
    })
}

const downloadFile = async (url, filePath) => {
    const response = await fetch(url);
    const fileStream = fs.createWriteStream(filePath);

    await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on("error", reject);
        fileStream.on("finish", resolve);
    });
};

const deleteFile = async (filePath) => {
    try {
        await fsPromises.unlink(filePath);
    } catch {}
}

const fetchUnityShareIdDirectDownloadURL = async (shareId) => {
    const response = await fetch(`https://build-api.cloud.unity3d.com/api/v1/shares/${shareId}`, {
        headers: {
            "Authorization": `Basic ${unityAPIKey}`,
            "Content-Type": "application/json"
        }
    });

    const json = await response.json;

    console.log(json);

    return json["links"]["download_primary"]["href"];
}

app.post("/hooks/unity/build/success", async (req, res) => {
    console.log(req.body);

    const platform = req.body.platform;

    const targetDirectoryPath = "arena-pvp-game/downloads";
    const targetFileName = platform.includes("linux") ? "linux-x64.zip" : "win-x64.zip";

    const shareURL = req.body.links["share_url"].href;
    
    const buildDownloadURL = await fetchUnityShareIdDirectDownloadURL(shareURL.split("=")[1]);
    const buildDownloadFilePath = `/tmp/arena-pvp-game-${targetFileName}`;

    await deleteFile(buildDownloadFilePath);

    await downloadFile(buildDownloadURL, buildDownloadFilePath);

    await cdnStorageDeleteFile(
        targetDirectoryPath,
        targetFileName
    );

    await cdnStorageUploadFile(
        buildDownloadFilePath,
        targetDirectoryPath,
        targetFileName
    );

    const latestCommit = req.body.lastBuiltRevision.substring(0, 7);

    const latestCommitLocalFilePath = "/tmp/arena-pvp-game-latest-commit.txt";

    await deleteFile(latestCommitLocalFilePath);

    await fsPromises.writeFile(latestCommitLocalFilePath, latestCommit);

    await cdnStorageDeleteFile(
        "arena-pvp-game",
        "latest-commit.txt"
    );

    await cdnStorageUploadFile(
        latestCommitLocalFilePath,
        "arena-pvp-game",
        "latest-commit.txt"
    );

    await cdnPurge();
});

app.listen(process.env.PORT || 4000);
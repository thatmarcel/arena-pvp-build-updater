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
const cdnStorageAccessKey = process.env.CDN_STORAGE_ACCESS_KEY;
const cdnStorageZoneName = process.env.CDN_STORAGE_ZONE_NAME;

const cdnStorageDeleteFile = async (directoryPath, fileName) => {
    const url = `https://storage.bunnycdn.com/${encodeURIComponent(cdnStorageZoneName)}/${directoryPath}/${encodeURIComponent(fileName)}`;

    await fetch(url, {
        method: "DELETE",
        headers: {
            "User-Agent": "arena-pvp-build-updater/1",
            "AccessKey": cdnStorageAccessKey
        }
    });
}

const cdnStorageUploadFile = async (localFilePath, targetDirectoryPath, targetFileName) => {
    const fileStream = fs.createReadStream(localFilePath);

    const url = `https://storage.bunnycdn.com/${encodeURIComponent(cdnStorageZoneName)}/${targetDirectoryPath}/${encodeURIComponent(targetFileName)}`;

    await fetch(url, {
        method: "PUT",
        body: fileStream,
        headers: {
            "User-Agent": "arena-pvp-build-updater/1",
            "Content-Type": "application/octet-stream",
            "AccessKey": cdnStorageAccessKey
        }
    });
}

const cdnPurge = async () => {
    const url = `https://api.bunny.net/purge?url=${encodeURIComponent(`https://${cdnStorageZoneName}.b-cdn.net/*`)}`;

    await fetch(url, {
        method: "POST",
        headers: {
            "User-Agent": "arena-pvp-build-updater/1",
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
    const url = `https://build-api.cloud.unity3d.com/api/v1/shares/${shareId}`;

    const response = await fetch(url, {
        headers: {
            "User-Agent": "arena-pvp-build-updater/1",
            "Authorization": `Basic ${unityAPIKey}`,
            "Content-Type": "application/json"
        }
    });

    const json = await response.json();

    return json["links"]["download_primary"]["href"];
}

const handleUnityBuildSuccess = async (json) => {
    const platform = json.platform;
    const archId = platform.includes("linux") ? "linux-x64" : "win-x64";

    const targetDirectoryPath = "arena-pvp-game/downloads";
    const targetFileName = `${archId}.zip`;

    const shareURL = json.links["share_url"].href;
    
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

    const latestCommit = json.lastBuiltRevision.substring(0, 7);

    const latestCommitLocalFilePath = "/tmp/arena-pvp-game-latest-commit.txt";

    await deleteFile(latestCommitLocalFilePath);

    await fsPromises.writeFile(latestCommitLocalFilePath, latestCommit);

    const latestCommitDirectoryPath = "arena-pvp-game";
    const latestCommitFileName = `latest-commit-${archId}.txt`;

    await cdnStorageDeleteFile(
        latestCommitDirectoryPath,
        latestCommitFileName
    );

    await cdnStorageUploadFile(
        latestCommitLocalFilePath,
        latestCommitDirectoryPath,
        latestCommitFileName
    );

    await cdnPurge();

    console.log("Finished processing build");
}

app.post("/hooks/unity/build/success", async (req, res) => {
    console.log("Processing successful build");

    handleUnityBuildSuccess(req.body);

    res.status(200).send("Success");
});

app.listen(process.env.PORT || 4000);
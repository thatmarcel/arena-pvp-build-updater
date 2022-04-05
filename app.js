import express from "express";
import cors from "cors";

const app = express();

app.use(express.json());
app.use(cors());

app.post("/hooks/unity/build/success", (req, res) => {
    console.log(req.body);
});

app.listen(process.env.PORT || 4000);
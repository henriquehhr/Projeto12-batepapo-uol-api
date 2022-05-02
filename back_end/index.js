import express, { json } from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import joi from "joi";
import dayjs from "dayjs";
import dotenv from "dotenv";
import chalk from "chalk";

const app = express();
app.use(json());
app.use(cors());
dotenv.config();

app.listen(process.env.PORT, () => { console.log(chalk.bold.green(`Server live at http://localhost/${process.env.PORT}`)) });

app.post("/participants", async (req, res) => { //TODO verificar se posso enviar mais propriedades além do nome no body
    const { name } = req.body;
    const userSchema = joi.object({
        name: joi.string().required()
    });
    const validation = userSchema.validate({ name }, { abortEarly: true });
    if (validation.error) {
        res.status(422).send(validation.error.details);
        return;
    }

    const mongoClient = new MongoClient(process.env.MONGO_URI);
    try {
        await mongoClient.connect();
        const db = mongoClient.db("batePapoUOL");
        const user = await db.collection("users").findOne({ name });
        if (user) {
            res.sendStatus(409);
            mongoClient.close();
            return;
        }
        const now = Date.now();
        await db.collection("users").insertOne({ name, lastStatus: now });
        await db.collection("messages").insertOne({
            from: name,
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            time: dayjs(now) //TODO confirmar o formato da data
        });
        res.sendStatus(201);
        mongoClient.close();
    } catch (e) {
        console.log(e);
        res.send(e);
        mongoClient.close();
    }
});
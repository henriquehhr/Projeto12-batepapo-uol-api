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

setInterval(async () => {
    const mongoClient = new MongoClient(process.env.MONGO_URI);
    try {
        await mongoClient.connect();
        const db = mongoClient.db("batePapoUOL");
        const users = await db.collection("users").find().toArray();
        const now = Date.now();
        for (let user of users) {
            if (now - user.lastStatus > 10000) {
                console.log(user.name);
                await db.collection("users").deleteOne({ name: user.name });
                await db.collection("messages").insertOne({
                    from: user.name,
                    to: "Todos",
                    text: "sai da sala...",
                    type: "status",
                    time: dayjs(now)
                });
            }
        }
    } catch (e) {
        console.log(e);
    } finally {
        mongoClient.close();
    }
}, 15000);

app.post("/participants", async (req, res) => { //TODO verificar se posso enviar mais propriedades além do nome no body
    const { name } = req.body;
    const userSchema = joi.object({
        name: joi.string().required()
    });
    const validation = userSchema.validate({ name }, { abortEarly: false });
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

app.get("/participants", async (req, res) => { //TODO retornar o objeto do usuáio inteiro, junto do "lastStatus" ?
    const mongoClient = new MongoClient(process.env.MONGO_URI);
    try {
        await mongoClient.connect();
        const db = mongoClient.db("batePapoUOL");
        const users = await db.collection("users").find().toArray();
        res.send(users);
        mongoClient.close();
    } catch (e) {
        console.log(e);
        res.send(e);
        mongoClient.close();
    }
});

app.post("/messages", async (req, res) => {
    const { body } = req;
    const { user: from } = req.headers;
    const userSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.valid("message", "private_message").required()
    });
    const validation = userSchema.validate(body, { abortEarly: false });
    if (validation.error) {
        res.status(422).send(validation.error.details);
        return;
    }

    const mongoClient = new MongoClient(process.env.MONGO_URI);
    try {
        await mongoClient.connect();
        const db = mongoClient.db("batePapoUOL");
        const user = await db.collection("users").findOne({ name: from });
        if (!user) {
            console.log("não achou remetente");
            res.sendStatus(422);
            mongoClient.close();
            return;
        }

        await db.collection("messages").insertOne({
            ...body,
            from,
            time: dayjs(new Date())
        });
        res.sendStatus(201);
        mongoClient.close();
    } catch (e) {
        console.log(e);
        res.send(e);
        mongoClient.close();
    }
});

app.get("/messages", async (req, res) => { //TODO as mensagens de status contam no limite?
    const limit = req.query.limit ? parseInt(req.query.limit) : Number.POSITIVE_INFINITY;
    const { user } = req.headers;

    const mongoClient = new MongoClient(process.env.MONGO_URI);
    try {
        await mongoClient.connect();
        const db = mongoClient.db("batePapoUOL");
        const messages = await db.collection("messages").find().toArray();
        let count = 0;
        const filteredMessages = messages.filter((message) => {
            if (message.type == "message" || message.type == "status" || (message.type == "private_message" && (message.to == user || message.from == user))) {
                count++;
                if (count == limit)
                    messages.length = 0;
                return true;
            }
            return false;
        });
        res.send(filteredMessages);
        mongoClient.close();
    } catch (e) {
        console.log(e);
        res.send(e);
        mongoClient.close();
    }
});

app.post("/status", async (req, res) => {
    const { user } = req.headers;

    const mongoClient = new MongoClient(process.env.MONGO_URI);
    try {
        await mongoClient.connect();
        const db = mongoClient.db("batePapoUOL");
        if (!await db.collection("users").findOne({ name: user })) {
            res.sendStatus(404);
            mongoClient.close();
            return;
        }
        await db.collection("users").updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
        res.sendStatus(200);
        mongoClient.close();
    } catch (e) {
        console.log(e);
        res.sendStatus(e);
        mongoClient.close();
    }
});
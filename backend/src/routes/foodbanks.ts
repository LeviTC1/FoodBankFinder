import { Router } from "express";
import { FoodBankController } from "../controllers/foodBankController";

const controller = new FoodBankController();

export const foodBankRouter = Router();

foodBankRouter.get("/", controller.list);
foodBankRouter.get("/nearby", controller.nearby);
foodBankRouter.get("/open-nearby", controller.openNearby);
foodBankRouter.get("/search", controller.search);
foodBankRouter.get("/stats", controller.stats);
foodBankRouter.get("/coverage", controller.coverage);
foodBankRouter.get("/organisations", controller.organisations);
foodBankRouter.get("/:id", controller.byId);

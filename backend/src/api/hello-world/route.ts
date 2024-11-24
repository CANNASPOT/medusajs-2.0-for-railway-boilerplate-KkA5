import type {
    MedusaRequest,
    MedusaResponse,
  } from "@medusajs/framework"
  
  export const GET = (
    req: MedusaRequest,
    res: MedusaResponse
  ) => {
    res.json({
      message: "[GET] Hello world!",
    })
  }
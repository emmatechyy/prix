import { getThesis } from "@/lib/model/thesis";
import { fail, json } from "@/lib/api";

export const revalidate = 600;

export async function GET() {
  try {
    return json(await getThesis());
  } catch (e) {
    return fail(e);
  }
}

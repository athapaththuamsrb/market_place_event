const schedule = require("node-schedule");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

schedule.scheduleJob("*/15 * * * *", async () => {
	// Execute something every 15 minutes
	console.log("running a task every 15 minute");
	console.log(Date.now());
	try {
		//Expire fix sale orders
		const a = await prisma.activity.updateMany({
			where: {
				isExpired: false,
				listingtype: "FIXED_PRICE",
				endDate: { lte: Date.now() },
			},
			data: { isExpired: true },
		});
		// console.log("a", a);

		//Expire offers
		const b = await prisma.bidding.updateMany({
			where: {
				isExpired: false,
				endDate: { lte: Date.now() },
				OR: [{ state: "PENDDING" }, { state: "REJECTED" }],
				listingtype: "OFFER",
			},
			data: { isExpired: true, state: "REJECTED" },
		});
		// console.log("b", b);

		//Expire the accept bid but didn't pay before the end date TIMED_AUCTION bids AND OFFER bids
		const expireAcceptBid = await prisma.bidding.updateMany({
			where: {
				isExpired: false,
				endDate: { lte: Date.now() },
				state: "ACCEPTED",
			},
			data: { isExpired: true },
		});
		await prisma.activity.updateMany({
			where: {
				isExpired: false,
				endDate: { lte: Date.now() },
				isPenddingPayment: true,
			},
			data: {
				isExpired: true,
			},
		});
		// console.log("expireAcceptBid", expireAcceptBid);
		//set time aution bid
		const timeAutions = await prisma.activity.findMany({
			where: {
				isExpired: false,
				listingtype: "TIMED_AUCTION",
				endDate: { lte: Date.now() },
			},
		});
		console.log("timeAutions", timeAutions);
		timeAutions.forEach(async (timeAution) => {
			const a = await prisma.bidding.updateMany({
				where: {
					activityId: timeAution.id,
					isExpired: false,
					endDate: { lt: timeAution.endDate },
					state: "PENDDING",
					listingtype: "TIMED_AUCTION",
				},
				data: { isExpired: true, state: "REJECTED" },
			});
			console.log("a", a);
			//get maximum bid price
			const maxPriceBid = await prisma.bidding.aggregate({
				where: {
					activityId: timeAution.id,
					isExpired: false,
					endDate: timeAution.endDate,
					state: "PENDDING",
					listingtype: "TIMED_AUCTION",
				},
				_max: { price: true },
			});
			console.log("maxPriceBid", maxPriceBid);
			//upadate bidding table
			if (maxPriceBid._max.price !== null) {
				const c = await prisma.bidding.updateMany({
					where: {
						activityId: timeAution.id,
						isExpired: false,
						endDate: timeAution.endDate,
						state: "PENDDING",
						listingtype: "TIMED_AUCTION",
					},
					data: { isExpired: true, state: "REJECTED" },
				});
				console.log("c", c);
				const maxBid = await prisma.bidding.findFirst({
					where: {
						activityId: timeAution.id,
						isExpired: true,
						endDate: timeAution.endDate,
						state: "REJECTED",
						listingtype: "TIMED_AUCTION",
						price: maxPriceBid._max.price,
					},
				});
				console.log("maxBid", maxBid);
				const d = await prisma.bidding.update({
					where: { id: maxBid.id },
					data: {
						state: "ACCEPTED",
						endDate:
							Number(timeAution.endDate) + Number(2 * 24 * 60 * 60 * 1000),
					},
				});
				console.log("d", d);
				//update activity table
				const e = await prisma.activity.update({
					where: {
						id: timeAution.id,
					},
					data: {
						isPenddingPayment: true,
						endDate:
							Number(timeAution.endDate) + Number(2 * 24 * 60 * 60 * 1000),
					},
				});
				console.log("e", e);
			} else {
				//update activity table
				const f = await prisma.activity.update({
					where: {
						id: timeAution.id,
					},
					data: {
						isExpired: true,
					},
				});
				console.log("f", f);
			}
		});
	} catch (error) {
		console.log(error);
	}
});

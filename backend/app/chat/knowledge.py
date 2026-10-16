"""General dish knowledge (author-written, labelled "kiến thức chung") and how it maps onto dataset coverage.

A blurb says what a dish *is*; it never claims that a given venue serves it or that it is typical of an area.
Coverage numbers always come from counting dataset venues (tags or names containing the match phrases).
"""
from __future__ import annotations

# key, display, blurb, temp (cool|warm|neutral), meals, match phrases (folded; matched on venue tags or name)
DISHES = [
    ("pho", "Phở", "Món nước với bánh phở và nước dùng thanh, thường ăn bữa sáng hoặc trưa.", "warm", ("breakfast", "lunch", "dinner"), ("pho",)),
    ("bun cha", "Bún chả", "Bún ăn với chả nướng và nước chấm chua ngọt, hay gặp ở bữa trưa.", "neutral", ("lunch",), ("bun cha",)),
    ("bun", "Món bún", "Nhóm món dùng bún (bún riêu, bún thang, bún bò…), có cả món nước và món trộn.", "neutral", ("lunch", "dinner"), ("bun",)),
    ("banh cuon", "Bánh cuốn", "Lớp bánh gạo mỏng cuốn nhân, ăn nhẹ vào buổi sáng.", "light", ("breakfast",), ("banh cuon",)),
    ("banh mi", "Bánh mì", "Bánh mì kẹp nhân, gọn nhẹ để ăn nhanh hoặc ăn dọc đường.", "light", ("breakfast", "snack"), ("banh mi",)),
    ("xoi", "Xôi", "Xôi nếp với nhiều loại nhân và topping, no lâu và dễ mang đi.", "light", ("breakfast",), ("xoi",)),
    ("nem", "Nem / chả giò", "Món chiên cuốn nhân, hợp ăn vặt hoặc làm món phụ.", "neutral", ("snack", "dinner"), ("nem", "cha gio")),
    ("oc", "Ốc", "Các món ốc chế biến nhiều kiểu (luộc, xào, nướng), thường ăn buổi chiều tối.", "warm", ("snack", "dinner"), ("oc",)),
    ("hai san", "Hải sản", "Nhóm món từ tôm, cua, cá, ốc…; nhóm này có thể chứa các tác nhân gây dị ứng.", "neutral", ("dinner",), ("hai san",)),
    ("lau", "Lẩu", "Món nhúng nước dùng nóng, hợp đi nhóm vào buổi tối.", "warm", ("dinner",), ("lau",)),
    ("com", "Cơm", "Cơm với món mặn, canh và rau, hợp bữa trưa hoặc tối.", "neutral", ("lunch", "dinner"), ("com",)),
    ("che", "Chè", "Món ngọt nấu hoặc pha từ đậu, trái cây, thạch…; có kiểu ăn nóng và kiểu ăn lạnh.", "cool", ("snack", "dinner"), ("che",)),
    ("kem", "Kem", "Món lạnh tráng miệng, hợp ngày nóng.", "cool", ("snack",), ("kem",)),
    ("tra", "Trà / trà sữa / nước mát", "Đồ uống lạnh để giải khát; mức đường thường tuỳ chỉnh được ở từng quán.", "cool", ("snack",), ("tra sua", "tra chanh", "nuoc mia", "thuc uong")),
    ("sinh to", "Sinh tố / nước ép", "Đồ uống làm từ trái cây xay hoặc ép.", "cool", ("snack",), ("sinh to", "nuoc ep")),
    ("ca phe", "Cà phê", "Đồ uống cà phê với nhiều cách pha; một số quán có không gian ngồi lâu.", "neutral", ("breakfast", "snack"), ("ca phe",)),
    ("an vat", "Ăn vặt", "Các món nhỏ ăn chơi (bánh, nem, đồ chiên…), hợp đi bộ và thử nhiều quán.", "light", ("snack",), ("an vat", "an nhe")),
    ("banh", "Bánh ngọt / bánh truyền thống", "Các loại bánh ngọt và bánh dân gian, thường ăn kèm trà hoặc cà phê.", "neutral", ("snack",), ("banh",)),
]
_BY_KEY = {d[0]: d for d in DISHES}
MOOD_TEMPS = {"cool": ("cool", "light"), "warm": ("warm", "neutral"), "light": ("light", "cool"), None: ("neutral", "warm", "light", "cool")}


def entries_for(mood=None, meal=None) -> list:
    temps = MOOD_TEMPS.get(mood, MOOD_TEMPS[None])
    out = [d for d in DISHES if d[3] in temps and (meal is None or meal in d[4])]
    return out or [d for d in DISHES if d[3] in temps]


def lookup_dish(folded_text: str):
    """Entry named in the text (longest key first), else None."""
    for d in sorted(DISHES, key=lambda x: -len(x[0])):
        for p in d[5] + (d[0],):
            if (" " + p + " ") in (" " + folded_text + " "):
                return d
    return None

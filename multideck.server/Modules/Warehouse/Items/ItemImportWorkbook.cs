using System.Globalization;
using ClosedXML.Excel;

namespace Multideck.Server.Modules.Warehouse.Items;

public enum ItemImportField
{
    Sku,
    Description,
    BaseUomCode,
    CommodityDescription,
    HsCode,
    CountryOfOriginCode,
    LengthM,
    WidthM,
    HeightM,
    NetWeightKg,
    GrossWeightKg,
    TemperatureMinC,
    TemperatureMaxC,
    IsDangerousGoods,
    IsExciseGoods,
    IsHighValue,
    IsBondedEligible,
    RequiresLot,
    RequiresSerial,
    RequiresExpiry,
}

public enum ItemImportKind
{
    Text,
    Number,
    Bool,
}

public sealed record ItemImportColumn(
    string Header,
    ItemImportField Field,
    ItemImportKind Kind,
    bool Required,
    string[] Aliases,
    string Example1,
    string Example2);

/// <summary>
/// Single source of truth for the item import spreadsheet layout. Used to both generate the
/// template and parse uploaded files, so the two can never drift apart.
/// </summary>
public static class ItemImportColumns
{
    public static readonly IReadOnlyList<ItemImportColumn> All =
    [
        new("SKU", ItemImportField.Sku, ItemImportKind.Text, true, [], "MAR-ACT-044", "MAR-RSJ-118"),
        new("Description", ItemImportField.Description, ItemImportKind.Text, true, [], "Thermal activewear carton", "Rain shell jackets"),
        new("Base UOM", ItemImportField.BaseUomCode, ItemImportKind.Text, true, ["baseunitofmeasure", "uom", "unitofmeasure"], "EA", "CTN"),
        new("Commodity description", ItemImportField.CommodityDescription, ItemImportKind.Text, false, [], "Knitted activewear", "Waterproof outerwear"),
        new("HS code", ItemImportField.HsCode, ItemImportKind.Text, false, [], "6109.90.20", "6201.40.90"),
        new("Country of origin", ItemImportField.CountryOfOriginCode, ItemImportKind.Text, false, ["countryoforigincode", "origin"], "CN", "VN"),
        new("Length (m)", ItemImportField.LengthM, ItemImportKind.Number, false, [], "0.6", "0.8"),
        new("Width (m)", ItemImportField.WidthM, ItemImportKind.Number, false, [], "0.4", "0.5"),
        new("Height (m)", ItemImportField.HeightM, ItemImportKind.Number, false, [], "0.3", "0.35"),
        new("Net weight (kg)", ItemImportField.NetWeightKg, ItemImportKind.Number, false, [], "8", "12"),
        new("Gross weight (kg)", ItemImportField.GrossWeightKg, ItemImportKind.Number, false, [], "9", "13.5"),
        new("Min temperature (C)", ItemImportField.TemperatureMinC, ItemImportKind.Number, false, ["mintempc", "mintemperature"], "", ""),
        new("Max temperature (C)", ItemImportField.TemperatureMaxC, ItemImportKind.Number, false, ["maxtempc", "maxtemperature"], "", ""),
        new("Dangerous goods", ItemImportField.IsDangerousGoods, ItemImportKind.Bool, false, [], "No", "No"),
        new("Excise goods", ItemImportField.IsExciseGoods, ItemImportKind.Bool, false, [], "No", "No"),
        new("High value", ItemImportField.IsHighValue, ItemImportKind.Bool, false, [], "No", "Yes"),
        new("Bonded eligible", ItemImportField.IsBondedEligible, ItemImportKind.Bool, false, [], "No", "No"),
        new("Requires lot", ItemImportField.RequiresLot, ItemImportKind.Bool, false, [], "Yes", "No"),
        new("Requires serial", ItemImportField.RequiresSerial, ItemImportKind.Bool, false, [], "No", "No"),
        new("Requires expiry", ItemImportField.RequiresExpiry, ItemImportKind.Bool, false, [], "No", "No"),
    ];

    public static string Normalise(string header)
    {
        return new string(header.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
    }
}

public interface IItemImportWorkbook
{
    byte[] BuildTemplate();
    IReadOnlyList<ImportItemRow> Parse(Stream stream);
}

public sealed class ItemImportWorkbook : IItemImportWorkbook
{
    private const string ItemsSheetName = "Items";

    public byte[] BuildTemplate()
    {
        using var workbook = new XLWorkbook();

        var sheet = workbook.Worksheets.Add(ItemsSheetName);
        for (var index = 0; index < ItemImportColumns.All.Count; index++)
        {
            var column = ItemImportColumns.All[index];
            var columnNumber = index + 1;
            sheet.Cell(1, columnNumber).Value = column.Header;
            WriteExample(sheet.Cell(2, columnNumber), column, column.Example1);
            WriteExample(sheet.Cell(3, columnNumber), column, column.Example2);
            sheet.Column(columnNumber).Width = Math.Max(column.Header.Length + 2, 14);
        }

        sheet.Row(1).Style.Font.Bold = true;
        sheet.SheetView.FreezeRows(1);

        var required = string.Join(", ", ItemImportColumns.All.Where(column => column.Required).Select(column => column.Header));
        var instructions = workbook.Worksheets.Add("Instructions");
        var lines = new[]
        {
            "Multideck - Item import template",
            "",
            "How to use",
            "1. Fill in one row per item on the 'Items' sheet.",
            "2. Keep the header row exactly as provided.",
            "3. Upload the file in Warehouse > Items > Import, then choose the customer and facility.",
            "",
            $"Required fields (every row must have these): {required}",
            "",
            "Yes/No fields accept: Yes, No, True, False, 1, 0.",
            "Number fields use a dot for decimals, e.g. 12.5. Leave blank if not applicable.",
            "The customer and facility are chosen in the app, not in this file.",
            "The two example rows can be deleted before importing.",
        };

        for (var index = 0; index < lines.Length; index++)
        {
            instructions.Cell(index + 1, 1).Value = lines[index];
        }

        instructions.Cell(1, 1).Style.Font.Bold = true;
        instructions.Column(1).Width = 90;

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    public IReadOnlyList<ImportItemRow> Parse(Stream stream)
    {
        using var workbook = new XLWorkbook(stream);
        var sheet = workbook.Worksheets.FirstOrDefault(worksheet => string.Equals(worksheet.Name, ItemsSheetName, StringComparison.OrdinalIgnoreCase))
            ?? workbook.Worksheets.FirstOrDefault();

        if (sheet is null)
        {
            return [];
        }

        var headerRow = sheet.FirstRowUsed();
        if (headerRow is null)
        {
            return [];
        }

        var columnNumberByField = ResolveColumns(headerRow);
        var rows = new List<ImportItemRow>();

        foreach (var row in sheet.RowsUsed().Where(row => row.RowNumber() > headerRow.RowNumber()))
        {
            var values = new RowValues();
            var hasAnyValue = false;

            foreach (var (field, columnNumber) in columnNumberByField)
            {
                var cell = row.Cell(columnNumber);
                if (cell.IsEmpty())
                {
                    continue;
                }

                var column = ItemImportColumns.All.First(item => item.Field == field);
                switch (column.Kind)
                {
                    case ItemImportKind.Text:
                        var text = ReadText(cell);
                        if (text is not null) { values.SetText(field, text); hasAnyValue = true; }
                        break;
                    case ItemImportKind.Number:
                        var number = ReadNumber(cell);
                        if (number.HasValue) { values.SetNumber(field, number.Value); hasAnyValue = true; }
                        break;
                    case ItemImportKind.Bool:
                        var flag = ReadBool(cell);
                        values.SetBool(field, flag);
                        if (flag) hasAnyValue = true;
                        break;
                }
            }

            if (hasAnyValue)
            {
                rows.Add(values.ToRow(row.RowNumber()));
            }
        }

        return rows;
    }

    private static Dictionary<ItemImportField, int> ResolveColumns(IXLRow headerRow)
    {
        var columnNumberByNormalisedHeader = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var cell in headerRow.CellsUsed())
        {
            var normalised = ItemImportColumns.Normalise(cell.GetString());
            if (!string.IsNullOrEmpty(normalised) && !columnNumberByNormalisedHeader.ContainsKey(normalised))
            {
                columnNumberByNormalisedHeader[normalised] = cell.Address.ColumnNumber;
            }
        }

        var resolved = new Dictionary<ItemImportField, int>();
        foreach (var column in ItemImportColumns.All)
        {
            var candidates = new List<string> { ItemImportColumns.Normalise(column.Header) };
            candidates.AddRange(column.Aliases);

            foreach (var candidate in candidates)
            {
                if (columnNumberByNormalisedHeader.TryGetValue(candidate, out var columnNumber))
                {
                    resolved[column.Field] = columnNumber;
                    break;
                }
            }
        }

        return resolved;
    }

    private static string? ReadText(IXLCell cell)
    {
        var text = cell.GetString().Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    private static decimal? ReadNumber(IXLCell cell)
    {
        if (cell.TryGetValue<double>(out var number))
        {
            return (decimal)number;
        }

        return decimal.TryParse(cell.GetString().Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static bool ReadBool(IXLCell cell)
    {
        if (cell.TryGetValue<bool>(out var boolean))
        {
            return boolean;
        }

        var text = cell.GetString().Trim().ToLowerInvariant();
        return text is "yes" or "y" or "true" or "1" or "x";
    }

    private static void WriteExample(IXLCell cell, ItemImportColumn column, string example)
    {
        if (string.IsNullOrEmpty(example))
        {
            return;
        }

        if (column.Kind == ItemImportKind.Number && decimal.TryParse(example, NumberStyles.Any, CultureInfo.InvariantCulture, out var number))
        {
            cell.Value = (double)number;
        }
        else
        {
            cell.Value = example;
        }
    }

    private sealed class RowValues
    {
        private string? _sku;
        private string? _description;
        private string? _baseUomCode;
        private string? _commodityDescription;
        private string? _hsCode;
        private string? _countryOfOriginCode;
        private decimal? _lengthM;
        private decimal? _widthM;
        private decimal? _heightM;
        private decimal? _netWeightKg;
        private decimal? _grossWeightKg;
        private decimal? _temperatureMinC;
        private decimal? _temperatureMaxC;
        private bool _isDangerousGoods;
        private bool _isExciseGoods;
        private bool _isHighValue;
        private bool _isBondedEligible;
        private bool _requiresLot;
        private bool _requiresSerial;
        private bool _requiresExpiry;

        public void SetText(ItemImportField field, string value)
        {
            switch (field)
            {
                case ItemImportField.Sku: _sku = value; break;
                case ItemImportField.Description: _description = value; break;
                case ItemImportField.BaseUomCode: _baseUomCode = value; break;
                case ItemImportField.CommodityDescription: _commodityDescription = value; break;
                case ItemImportField.HsCode: _hsCode = value; break;
                case ItemImportField.CountryOfOriginCode: _countryOfOriginCode = value; break;
            }
        }

        public void SetNumber(ItemImportField field, decimal value)
        {
            switch (field)
            {
                case ItemImportField.LengthM: _lengthM = value; break;
                case ItemImportField.WidthM: _widthM = value; break;
                case ItemImportField.HeightM: _heightM = value; break;
                case ItemImportField.NetWeightKg: _netWeightKg = value; break;
                case ItemImportField.GrossWeightKg: _grossWeightKg = value; break;
                case ItemImportField.TemperatureMinC: _temperatureMinC = value; break;
                case ItemImportField.TemperatureMaxC: _temperatureMaxC = value; break;
            }
        }

        public void SetBool(ItemImportField field, bool value)
        {
            switch (field)
            {
                case ItemImportField.IsDangerousGoods: _isDangerousGoods = value; break;
                case ItemImportField.IsExciseGoods: _isExciseGoods = value; break;
                case ItemImportField.IsHighValue: _isHighValue = value; break;
                case ItemImportField.IsBondedEligible: _isBondedEligible = value; break;
                case ItemImportField.RequiresLot: _requiresLot = value; break;
                case ItemImportField.RequiresSerial: _requiresSerial = value; break;
                case ItemImportField.RequiresExpiry: _requiresExpiry = value; break;
            }
        }

        public ImportItemRow ToRow(int sourceRow) => new(
            _sku,
            _description,
            _baseUomCode,
            _commodityDescription,
            _hsCode,
            _countryOfOriginCode,
            _lengthM,
            _widthM,
            _heightM,
            _netWeightKg,
            _grossWeightKg,
            _isDangerousGoods,
            _isExciseGoods,
            _isHighValue,
            _isBondedEligible,
            _requiresLot,
            _requiresSerial,
            _requiresExpiry,
            _temperatureMinC,
            _temperatureMaxC,
            sourceRow);
    }
}

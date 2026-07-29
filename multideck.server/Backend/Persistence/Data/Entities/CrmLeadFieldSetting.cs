namespace Multideck.Persistence.Entities;

/// <summary>
/// A configurable lead capture field shared across the company. Options and the currently selected
/// options are stored as JSON arrays because the list is operator-defined and has no fixed shape.
/// </summary>
public sealed class CrmLeadFieldSetting
{
    public Guid CrmLeadFieldId { get; set; }
    public Guid CompanyId { get; set; }
    public string CrmLeadFieldLabel { get; set; } = null!;
    public string CrmLeadFieldTypeCode { get; set; } = null!;
    public string CrmLeadFieldOptionsJson { get; set; } = null!;
    public string CrmLeadFieldActiveOptionsJson { get; set; } = null!;
    public int CrmLeadFieldSortOrder { get; set; }
    public DateTime CrmLeadFieldCreatedAt { get; set; }
    public DateTime CrmLeadFieldUpdatedAt { get; set; }
    public Guid? CrmLeadFieldUpdatedByUserId { get; set; }
    public bool CrmLeadFieldIsDeleted { get; set; }
}

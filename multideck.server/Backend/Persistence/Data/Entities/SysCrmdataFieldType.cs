using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmdataFieldType
{
    public string CrmdataFieldTypeCode { get; set; } = null!;

    public string CrmdataFieldTypeName { get; set; } = null!;

    public string? CrmdataFieldTypePostgresCastType { get; set; }

    public string? CrmdataFieldTypeDescription { get; set; }

    public bool CrmdataFieldTypeIsActive { get; set; }

    public int CrmdataFieldTypeSortOrder { get; set; }

    public virtual ICollection<CrmAutomationFieldDefinition> CrmAutomationFieldDefinitions { get; set; } = new List<CrmAutomationFieldDefinition>();

    public virtual ICollection<CrmFieldUpdateQueue> CrmFieldUpdateQueues { get; set; } = new List<CrmFieldUpdateQueue>();
}

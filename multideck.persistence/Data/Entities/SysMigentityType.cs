using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysMigentityType
{
    public string MigentityTypeCode { get; set; } = null!;

    public string MigentityTypeName { get; set; } = null!;

    public string? MigentityTypeDescription { get; set; }

    public bool MigentityTypeIsMvp { get; set; }

    public bool MigentityTypeIsActive { get; set; }

    public int MigentityTypeSortOrder { get; set; }

    public virtual ICollection<MigCodeMapping> MigCodeMappings { get; set; } = new List<MigCodeMapping>();

    public virtual ICollection<MigFieldMapping> MigFieldMappings { get; set; } = new List<MigFieldMapping>();

    public virtual ICollection<MigImportBatch> MigImportBatches { get; set; } = new List<MigImportBatch>();

    public virtual ICollection<MigTemplateDefinition> MigTemplateDefinitions { get; set; } = new List<MigTemplateDefinition>();
}

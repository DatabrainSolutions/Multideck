using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigTemplateDefinition
{
    public Guid MigtemplateId { get; set; }

    public string MigtemplateCode { get; set; } = null!;

    public string MigtemplateName { get; set; } = null!;

    public string MigtemplateEntityTypeCode { get; set; } = null!;

    public string MigtemplateFileType { get; set; } = null!;

    public string MigtemplateDefinitionJson { get; set; } = null!;

    public bool MigtemplateIsActive { get; set; }

    public DateTime MigtemplateCreatedAt { get; set; }

    public virtual SysMigentityType MigtemplateEntityTypeCodeNavigation { get; set; } = null!;
}

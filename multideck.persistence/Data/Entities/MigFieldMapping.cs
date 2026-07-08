using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigFieldMapping
{
    public Guid MigfieldMapId { get; set; }

    public string MigfieldMapEntityTypeCode { get; set; } = null!;

    public string MigfieldMapSourceFieldName { get; set; } = null!;

    public string MigfieldMapTargetTable { get; set; } = null!;

    public string MigfieldMapTargetFieldName { get; set; } = null!;

    public string MigfieldMapTransformRuleJson { get; set; } = null!;

    public bool MigfieldMapIsRequired { get; set; }

    public bool MigfieldMapIsActive { get; set; }

    public virtual SysMigentityType MigfieldMapEntityTypeCodeNavigation { get; set; } = null!;
}
